import { generateText, stepCountIs } from 'ai';
import type { WebClient } from '@slack/web-api';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppMentionEvent, MessageImEvent, SlackInstallation } from './types';
import { resolveSlackUser } from './users';
import { findOrCreateThreadMapping, getSlackThreadHistory } from './threads';
import { markdownToSlack } from './format';
import { uploadFilesToSlack, extractFileArtifacts } from './files';
import { getToolsForOrg } from '@/modules/connections/registry';
import { retrieveContext } from '@/modules/memory/retriever';
import { extractAndSaveMemories } from '@/modules/memory/extractor';
import { summarizeAndStoreThread } from '@/modules/memory/thread-summary';
import { selectModel } from '@/modules/agent/model-router';
import { trackUsage } from '@/modules/observability/usage';
import { createMemoryTools } from '@/modules/memory/tools';
import { createScheduleTools } from '@/modules/scheduler/tools';
import { createSkillTools } from '@/modules/skills/tools';
import { createOrchestrationTools } from '@/modules/orchestration/tools';
import { createUsageTools } from '@/modules/observability/tools';
import { createSandboxTools } from '@/modules/sandbox/tools';
import { createPlanningTools } from '@/modules/agent/planner';
import { createBackgroundTools } from '@/modules/agent/background-tools';
import { createWorkspaceTools } from '@/modules/workspace/tools';
import { createCodeTools } from '@/modules/code/tools';
import { createIntegrationTool } from '@/modules/agent/integration-subagent';
import { buildSlackSystemPrompt } from './system-prompt';
import { createSlackTools } from './agent-tools';

interface HandlerContext {
  supabase: SupabaseClient;
  slackClient: WebClient;
  installation: SlackInstallation;
}

async function addReaction(
  slackClient: WebClient,
  channel: string,
  ts: string,
  emoji: string
): Promise<void> {
  try {
    await slackClient.reactions.add({ channel, timestamp: ts, name: emoji });
  } catch (err) {
    console.error(`[slack] Failed to add :${emoji}: reaction:`, err);
  }
}

async function removeReaction(
  slackClient: WebClient,
  channel: string,
  ts: string,
  emoji: string
): Promise<void> {
  try {
    await slackClient.reactions.remove({ channel, timestamp: ts, name: emoji });
  } catch {
    // May fail if already removed — that's fine
  }
}

async function buildTools(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  threadId: string,
  connectedServices: string[],
  slackClient: WebClient,
  installation: SlackInstallation
): Promise<Record<string, any>> {
  const builtInTools: Record<string, any> = {};

  Object.assign(builtInTools, createMemoryTools(supabase, orgId));
  Object.assign(builtInTools, createScheduleTools(supabase, orgId, userId));
  Object.assign(builtInTools, createSkillTools(supabase, orgId));
  Object.assign(builtInTools, createOrchestrationTools(supabase, orgId));
  Object.assign(builtInTools, createUsageTools(supabase, orgId));
  Object.assign(builtInTools, createWorkspaceTools(supabase, orgId, threadId));
  Object.assign(builtInTools, createPlanningTools(supabase, orgId, threadId));
  Object.assign(builtInTools, createBackgroundTools(supabase, orgId, userId, threadId, connectedServices));
  Object.assign(builtInTools, createSlackTools(slackClient, installation, supabase));

  if (process.env.E2B_API_KEY) {
    Object.assign(builtInTools, createSandboxTools(orgId, threadId));
  }

  // Load Composio tools via subagent pattern
  const composioTools = await getToolsForOrg(supabase, orgId, userId);
  if (Object.keys(composioTools).length > 0 && connectedServices.length > 0) {
    const integrationTool = createIntegrationTool(composioTools, connectedServices);
    Object.assign(builtInTools, integrationTool);
  }

  const hasGitHub = connectedServices.some((s) => s.toLowerCase().includes('github'));
  if (hasGitHub && process.env.E2B_API_KEY) {
    Object.assign(builtInTools, createCodeTools(supabase, orgId, threadId));
  }

  return builtInTools;
}

const MAX_SLACK_LENGTH = 39000;

function splitMessage(text: string): string[] {
  if (text.length <= MAX_SLACK_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_SLACK_LENGTH) {
      chunks.push(remaining);
      break;
    }
    const splitIndex = remaining.lastIndexOf('\n\n', MAX_SLACK_LENGTH);
    const cutAt = splitIndex > 0 ? splitIndex : MAX_SLACK_LENGTH;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt).trimStart();
  }
  return chunks;
}

async function processEvent(
  ctx: HandlerContext,
  slackUserId: string,
  slackTeamId: string,
  channel: string,
  messageTs: string,
  threadTs: string | undefined,
  userText: string,
  eventFiles?: Array<{ name: string; mimetype: string; size: number; url_private_download?: string }>
): Promise<void> {
  const { supabase, slackClient, installation } = ctx;

  // 1. Add thinking reaction
  await addReaction(slackClient, channel, messageTs, 'thinking_face');

  try {
    // 2. Resolve user
    const resolvedUser = await resolveSlackUser(
      supabase,
      slackClient,
      slackUserId,
      slackTeamId,
      installation.org_id
    );
    if (!resolvedUser) {
      throw new Error(`Failed to resolve Slack user ${slackUserId}`);
    }

    // 3. Determine the Slack thread to reply to.
    // If no thread_ts, this is a new top-level message — reply using its own ts.
    // If thread_ts exists, reply in that thread.
    const replyThreadTs = threadTs || messageTs;

    // 4. Find or create Cooper thread mapping
    const { threadId } = await findOrCreateThreadMapping(
      supabase,
      channel,
      replyThreadTs,
      installation.org_id,
      resolvedUser.userId
    );

    // 4b. Download and save any files attached to the message
    let mutableUserText = userText;
    if (eventFiles && eventFiles.length > 0) {
      for (const file of eventFiles) {
        if (file.url_private_download && file.size < 10 * 1024 * 1024) {
          try {
            const response = await fetch(file.url_private_download, {
              headers: { Authorization: `Bearer ${installation.bot_token}` },
            });
            const buffer = await response.arrayBuffer();
            await supabase.from('workspace_files').insert({
              org_id: installation.org_id,
              thread_id: threadId,
              filename: file.name,
              content: Buffer.from(buffer).toString('base64'),
              mime_type: file.mimetype,
              size: file.size,
            });
            mutableUserText += `\n[User attached file: ${file.name} (${file.mimetype}, ${file.size} bytes) — saved to workspace]`;
          } catch (err) {
            console.error(`[slack] Failed to download file ${file.name}:`, err);
          }
        }
      }
    }

    // 5. Build conversation context from Slack thread history
    let messages;
    if (threadTs) {
      messages = await getSlackThreadHistory(
        slackClient,
        channel,
        threadTs,
        installation.bot_user_id
      );
    } else {
      const cleanText = mutableUserText
        .replace(new RegExp(`<@${installation.bot_user_id}>`, 'g'), '')
        .trim();
      messages = [{ role: 'user' as const, content: cleanText }];
    }

    // 6. Save user message to DB
    const cleanUserText = mutableUserText
      .replace(new RegExp(`<@${installation.bot_user_id}>`, 'g'), '')
      .trim();
    await supabase.from('messages').insert({
      thread_id: threadId,
      role: 'user',
      content: cleanUserText,
    });

    // 7. Load org context
    const { data: activeConnections } = await supabase
      .from('connections')
      .select('name')
      .eq('org_id', installation.org_id)
      .eq('status', 'active');
    const connectedServices = (activeConnections || []).map((c: any) => c.name);

    const memoryContext = cleanUserText.trim()
      ? await retrieveContext(supabase, installation.org_id, cleanUserText)
      : { knowledge: [], matchedSkills: [], threadSummaries: [] };

    // 8. Build tools and system prompt
    const tools = await buildTools(
      supabase,
      installation.org_id,
      resolvedUser.userId,
      threadId,
      connectedServices,
      slackClient,
      installation
    );

    const systemPrompt = await buildSlackSystemPrompt(
      supabase,
      installation.org_id,
      memoryContext,
      connectedServices,
      cleanUserText
    );

    // 9. Generate response
    const modelSelection = selectModel(cleanUserText, connectedServices);
    console.log(
      `[slack] Generating response with ${modelSelection.modelId} for thread ${threadId}`
    );

    const result = await generateText({
      model: modelSelection.model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(25),
    });

    const responseText =
      result.text || "I wasn't able to generate a response. Try again!";
    const slackText = markdownToSlack(responseText);

    // 10. Post response to Slack
    const chunks = splitMessage(slackText);
    for (const chunk of chunks) {
      await slackClient.chat.postMessage({
        channel,
        thread_ts: replyThreadTs,
        text: chunk,
        unfurl_links: false,
      });
    }

    // 11. Upload file artifacts if any
    try {
      const fileArtifacts = extractFileArtifacts(result.steps);
      if (fileArtifacts.length > 0) {
        await uploadFilesToSlack(slackClient, channel, replyThreadTs, fileArtifacts);
      }
    } catch (err) {
      console.error('[slack] File extraction failed:', err);
    }

    // 12. Remove thinking reaction
    await removeReaction(slackClient, channel, messageTs, 'thinking_face');

    // 13. Save assistant message to DB
    const toolCallSummary: string[] = [];
    for (const step of result.steps) {
      for (const tc of step.toolCalls || []) {
        toolCallSummary.push(tc.toolName);
      }
    }

    await supabase.from('messages').insert({
      thread_id: threadId,
      role: 'assistant',
      content: responseText,
      tool_calls: toolCallSummary.length > 0 ? toolCallSummary : null,
      metadata: {
        model: modelSelection.modelId,
        toolsUsed: toolCallSummary,
        source: 'slack',
      },
    });

    // 14. Track usage
    try {
      const totalUsage = result.totalUsage;
      if (totalUsage) {
        await trackUsage(supabase, {
          orgId: installation.org_id,
          userId: resolvedUser.userId,
          threadId,
          modelId: modelSelection.modelId,
          modelProvider: modelSelection.provider,
          promptTokens: totalUsage.inputTokens || 0,
          completionTokens: totalUsage.outputTokens || 0,
          latencyMs: undefined,
          source: 'slack',
        });
      }
    } catch (err) {
      console.error('[slack] Usage tracking failed:', err);
    }

    // 15. Background: extract memories & summarize thread
    extractAndSaveMemories(
      supabase,
      installation.org_id,
      cleanUserText,
      responseText,
      memoryContext.knowledge
    ).catch((err) => console.error('[slack] Memory extraction failed:', err));

    summarizeAndStoreThread(supabase, threadId, installation.org_id).catch(
      (err) => console.error('[slack] Thread summarization failed:', err)
    );
  } catch (err) {
    console.error('[slack] Event processing failed:', err);
    await removeReaction(slackClient, channel, messageTs, 'thinking_face');
    await addReaction(slackClient, channel, messageTs, 'x');

    // Try to post error message
    const replyThreadTs = threadTs || messageTs;
    try {
      await slackClient.chat.postMessage({
        channel,
        thread_ts: replyThreadTs,
        text: "Sorry, I hit a snag processing that. Try again! :wrench:",
      });
    } catch {
      // Nothing we can do
    }
  }
}

export async function handleAppMention(
  ctx: HandlerContext,
  event: AppMentionEvent
): Promise<void> {
  if (event.bot_id || event.bot_profile) return;

  await processEvent(
    ctx,
    event.user,
    event.team || ctx.installation.team_id,
    event.channel,
    event.ts,
    event.thread_ts,
    event.text,
    event.files
  );
}

export async function handleDirectMessage(
  ctx: HandlerContext,
  event: MessageImEvent
): Promise<void> {
  if (event.bot_id || event.bot_profile || event.subtype) return;

  await processEvent(
    ctx,
    event.user,
    event.team || ctx.installation.team_id,
    event.channel,
    event.ts,
    event.thread_ts,
    event.text,
    event.files
  );
}

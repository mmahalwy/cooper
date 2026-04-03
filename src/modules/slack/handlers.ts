import { generateText, stepCountIs } from 'ai';
import type { WebClient } from '@slack/web-api';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppMentionEvent, MessageImEvent, MessageChangedEvent, ReactionAddedEvent, SlackInstallation } from './types';
import { addKnowledge } from '@/modules/memory/knowledge';
import { resolveSlackUser } from './users';
import { findOrCreateThreadMapping, getSlackThreadHistory } from './threads';
import { markdownToSlack } from './format';
import { uploadFilesToSlack, extractFileArtifacts } from './files';
import { getToolsForUser } from '@/modules/connections/registry';
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
import { manageSlackContextWindow } from '@/modules/agent/context-manager';
import { createSlackInteractiveTools } from './tools';
import { generateThreadTitle } from '@/modules/agent/title-generator';

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
  slackClient: WebClient,
  orgId: string,
  userId: string,
  threadId: string,
  connectedServices: string[],
  slackChannel: string,
  slackThreadTs: string
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

  // Slack-specific interactive tools (approval requests, etc.)
  Object.assign(
    builtInTools,
    createSlackInteractiveTools(slackClient, supabase, slackChannel, slackThreadTs, orgId, threadId)
  );

  if (process.env.E2B_API_KEY) {
    Object.assign(builtInTools, createSandboxTools(orgId, threadId));
  }

  // Load Composio tools via subagent pattern
  const composioTools = await getToolsForUser(supabase, orgId, userId);
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

async function postMessageWithAutoJoin(
  slackClient: WebClient,
  channel: string,
  thread_ts: string,
  text: string
): Promise<void> {
  try {
    await slackClient.chat.postMessage({ channel, thread_ts, text, unfurl_links: false });
  } catch (err: any) {
    if (err?.data?.error === 'not_in_channel' || err?.data?.error === 'channel_not_a_member') {
      console.log(`[slack] Not in channel ${channel} — attempting auto-join`);
      await slackClient.conversations.join({ channel });
      await slackClient.chat.postMessage({ channel, thread_ts, text, unfurl_links: false });
    } else {
      throw err;
    }
  }
}

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

interface ProcessEventOptions {
  /** When set, skip thread creation and use this existing Cooper thread ID directly. */
  existingThreadId?: string;
}

async function processEvent(
  ctx: HandlerContext,
  slackUserId: string,
  slackTeamId: string,
  channel: string,
  messageTs: string,
  threadTs: string | undefined,
  userText: string,
  options?: ProcessEventOptions
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

    // 4. Find or create Cooper thread mapping.
    // When an existingThreadId is provided (e.g. for message edits), skip the
    // DB lookup / creation and reuse that thread directly.
    let threadId: string;
    let isNew: boolean;

    if (options?.existingThreadId) {
      threadId = options.existingThreadId;
      isNew = false;
    } else {
      ({ threadId, isNew } = await findOrCreateThreadMapping(
        supabase,
        channel,
        replyThreadTs,
        installation.org_id,
        resolvedUser.userId
      ));
    }

    // First DM: threadTs is undefined (no existing thread) and this is a brand-new mapping
    const isFirstDm = isNew && threadTs === undefined;

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
      const cleanText = userText
        .replace(new RegExp(`<@${installation.bot_user_id}>`, 'g'), '')
        .trim();
      messages = [{ role: 'user' as const, content: cleanText }];
    }

    // 6. Save user message to DB
    const cleanUserText = userText
      .replace(new RegExp(`<@${installation.bot_user_id}>`, 'g'), '')
      .trim();
    await supabase.from('messages').insert({
      thread_id: threadId,
      role: 'user',
      content: cleanUserText,
    });

    // 7. Load org context
    const [{ data: activeConnections }, { data: orgData }] = await Promise.all([
      supabase
        .from('connections')
        .select('name')
        .eq('org_id', installation.org_id)
        .eq('status', 'active'),
      supabase
        .from('organizations')
        .select('model_preference')
        .eq('id', installation.org_id)
        .single(),
    ]);
    const connectedServices = (activeConnections || []).map((c: any) => c.name);
    const orgModelPreference = orgData?.model_preference && orgData.model_preference !== 'auto'
      ? orgData.model_preference
      : undefined;

    const memoryContext = cleanUserText.trim()
      ? await retrieveContext(supabase, installation.org_id, resolvedUser.userId, cleanUserText)
      : { knowledge: [], matchedSkills: [], threadSummaries: [] };

    // 7a. Context window compression: summarize old messages when thread is long
    let finalMessages = messages;
    let conversationSummary: string | null = null;

    if (messages.length > 15) {
      const managed = await manageSlackContextWindow(messages);
      finalMessages = managed.recentMessages;
      conversationSummary = managed.conversationSummary;
      if (managed.wasSummarized) {
        console.log(
          `[slack] Context compressed: ${managed.originalCount} → ${managed.recentMessages.length} messages`,
        );
      }
    }

    // 8. Build tools and system prompt
    const tools = await buildTools(
      supabase,
      slackClient,
      installation.org_id,
      resolvedUser.userId,
      threadId,
      connectedServices,
      channel,
      replyThreadTs
    );

    const systemPrompt = await buildSlackSystemPrompt(
      supabase,
      installation.org_id,
      memoryContext,
      connectedServices,
      cleanUserText,
      { isFirstMessage: isFirstDm, conversationSummary }
    );

    // 9. Generate response
    const requestStartTime = Date.now();
    const modelSelection = selectModel(cleanUserText, connectedServices, { orgModelPreference });
    console.log(
      `[slack] Generating response with ${modelSelection.modelId} for thread ${threadId}`
    );

    const result = await generateText({
      model: modelSelection.model,
      system: systemPrompt,
      messages: finalMessages,
      tools,
      stopWhen: stepCountIs(25),
    });

    const responseText =
      result.text || "I wasn't able to generate a response. Try again!";
    const slackText = markdownToSlack(responseText);

    // 10. Post response to Slack
    const chunks = splitMessage(slackText);
    for (const chunk of chunks) {
      await postMessageWithAutoJoin(slackClient, channel, replyThreadTs, chunk);
    }

    // 10a. Generate a smart thread title in the background for new threads
    if (isNew) {
      generateThreadTitle(supabase, threadId, cleanUserText, responseText).catch((err) =>
        console.error('[slack] Title generation failed:', err)
      );
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
          latencyMs: Date.now() - requestStartTime,
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
      resolvedUser.userId,
      cleanUserText,
      responseText,
      memoryContext.knowledge
    ).catch((err) => console.error('[slack] Memory extraction failed:', err));

    summarizeAndStoreThread(supabase, threadId, installation.org_id, resolvedUser.userId).catch(
      (err) => console.error('[slack] Thread summarization failed:', err)
    );
  } catch (err) {
    console.error('[slack] Event processing failed:', err);
    await removeReaction(slackClient, channel, messageTs, 'thinking_face');
    await addReaction(slackClient, channel, messageTs, 'x');

    // Try to post error message
    const replyThreadTs = threadTs || messageTs;
    try {
      await postMessageWithAutoJoin(
        slackClient,
        channel,
        replyThreadTs,
        "Sorry, I hit a snag processing that. Try again! :wrench:"
      );
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
    event.text
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
    event.text
  );
}

// ---------------------------------------------------------------------------
// Message edit handler
// ---------------------------------------------------------------------------

export async function handleMessageChanged(
  ctx: HandlerContext,
  event: MessageChangedEvent
): Promise<void> {
  const { supabase, slackClient, installation } = ctx;
  const channel = event.channel;
  const editedMessageTs = event.message.ts;
  const newText = event.message.text || '';
  const slackUserId = event.message.user;

  // Don't re-process if text is identical
  if (newText === event.previous_message?.text) return;

  // Find if this message has a corresponding thread in Cooper
  const { data: threadMapping } = await supabase
    .from('slack_thread_mappings')
    .select('thread_id')
    .eq('slack_channel_id', channel)
    .eq('slack_thread_ts', editedMessageTs)
    .single();

  if (!threadMapping) return; // No conversation started from this message — ignore

  // Clean the edited message text (remove bot mention)
  const cleanText = newText
    .replace(/<@[A-Z0-9]+>/g, '')
    .trim();

  if (!cleanText) return;

  // Post a brief acknowledgment in the thread
  try {
    await slackClient.chat.postMessage({
      channel,
      thread_ts: editedMessageTs,
      text: `_I see you updated that — let me re-read..._`,
      unfurl_links: false,
    });
  } catch (err) {
    console.error('[slack] handleMessageChanged: failed to post acknowledgment:', err);
  }

  // Route through normal processing, re-using the existing thread
  await processEvent(
    ctx,
    slackUserId,
    installation.team_id,
    channel,
    event.event_ts,  // use event_ts as the "message ts" for reactions
    editedMessageTs, // thread_ts — reply stays in original thread
    cleanText,
    { existingThreadId: threadMapping.thread_id }
  );
}

// ---------------------------------------------------------------------------
// Reaction-based commands
// ---------------------------------------------------------------------------

/**
 * Fetch the text of a Slack message by channel + ts.
 * Returns empty string if the message can't be fetched.
 */
async function fetchMessageText(
  slackClient: WebClient,
  channel: string,
  ts: string
): Promise<string> {
  try {
    const result = await slackClient.conversations.history({
      channel,
      latest: ts,
      oldest: ts,
      limit: 1,
      inclusive: true,
    });
    return result.messages?.[0]?.text || '';
  } catch {
    return '';
  }
}

/**
 * Handle reaction_added events and route to the matching command:
 *
 * 📌 pushpin                  → save message as a knowledge/memory item
 * 🔁 arrows_counterclockwise  → re-run the task from the reacted-to message
 * ✅ white_check_mark         → mark the task as done (no-op acknowledgement)
 * ❓ question                 → ask Cooper to explain the message
 */
export async function handleReactionAdded(
  ctx: HandlerContext,
  event: ReactionAddedEvent
): Promise<void> {
  const { supabase, slackClient, installation } = ctx;
  const { reaction, item, user: slackUserId } = event;

  // Only handle message reactions
  if (item.type !== 'message') return;

  // Ignore reactions on events we don't care about (fast path)
  const HANDLED_REACTIONS = new Set([
    'pushpin',
    'arrows_counterclockwise',
    'white_check_mark',
    'question',
  ]);
  if (!HANDLED_REACTIONS.has(reaction)) return;

  // Ignore Cooper's own reactions
  try {
    const botInfo = await slackClient.auth.test();
    if (slackUserId === botInfo.user_id) return;
  } catch {
    return;
  }

  // Fetch the message that was reacted to
  const originalText = await fetchMessageText(slackClient, item.channel, item.ts);
  if (!originalText) return;

  // Resolve the reacting user → org
  const { data: userMapping } = await supabase
    .from('slack_user_mappings')
    .select('org_id, user_id')
    .eq('slack_user_id', slackUserId)
    .eq('slack_team_id', installation.team_id)
    .single();

  switch (reaction) {
    // -----------------------------------------------------------------------
    // 📌  Save as memory
    // -----------------------------------------------------------------------
    case 'pushpin': {
      if (!userMapping) return;

      const saved = await addKnowledge(
        supabase,
        userMapping.org_id,
        originalText,
        'user'
      );

      if (saved) {
        await addReaction(slackClient, item.channel, item.ts, 'white_check_mark');
        await slackClient.chat.postMessage({
          channel: item.channel,
          thread_ts: item.ts,
          text: '📌 Got it — saved to memory. I\'ll remember this going forward.',
          unfurl_links: false,
        });
      }
      break;
    }

    // -----------------------------------------------------------------------
    // 🔁  Re-run the task
    // -----------------------------------------------------------------------
    case 'arrows_counterclockwise': {
      // Post the original message as a new @Cooper mention so it flows through
      // the normal event pipeline with full context.
      const botInfo = await slackClient.auth.test();
      await slackClient.chat.postMessage({
        channel: item.channel,
        thread_ts: item.ts,
        text: `<@${botInfo.user_id}> ${originalText}`,
        unfurl_links: false,
      });
      break;
    }

    // -----------------------------------------------------------------------
    // ✅  Acknowledge / mark done (no-op — just confirm receipt)
    // -----------------------------------------------------------------------
    case 'white_check_mark': {
      // Nothing to do — the user's own ✅ reaction is the visual confirmation.
      // We intentionally don't double-react or post to avoid noise.
      break;
    }

    // -----------------------------------------------------------------------
    // ❓  Explain this message
    // -----------------------------------------------------------------------
    case 'question': {
      if (!userMapping) return;

      // Show thinking indicator
      await addReaction(slackClient, item.channel, item.ts, 'thinking_face');

      try {
        const { generateText: aiGenerateText } = await import('ai');
        const { selectModel } = await import('@/modules/agent/model-router');

        const modelSelection = selectModel(originalText, []);
        const result = await aiGenerateText({
          model: modelSelection.model,
          prompt: `A user reacted with ❓ to the following Slack message. Explain it clearly and concisely — what it means, what context is implied, and any action it suggests. Write in plain Slack-friendly text (no markdown headers).\n\nMessage:\n${originalText}`,
        });

        await removeReaction(slackClient, item.channel, item.ts, 'thinking_face');
        await slackClient.chat.postMessage({
          channel: item.channel,
          thread_ts: item.ts,
          text: result.text,
          unfurl_links: false,
        });
      } catch (err) {
        console.error('[slack] reaction:question — AI call failed:', err);
        await removeReaction(slackClient, item.channel, item.ts, 'thinking_face');
        await addReaction(slackClient, item.channel, item.ts, 'x');
      }
      break;
    }

    default:
      break;
  }
}

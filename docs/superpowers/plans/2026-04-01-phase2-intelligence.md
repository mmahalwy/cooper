# Phase 2: Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-provider model routing, simplify Composio tools into direct wrappers, and enforce tool allow/deny filtering.

**Architecture:** Model router classifies messages by complexity and selects the best provider. Action resolver pre-fetches top actions per connected app and wraps them as direct AI SDK tools. Tool filtering removes disabled tools from the model's view entirely.

**Tech Stack:** AI SDK (@ai-sdk/anthropic, @ai-sdk/openai, @ai-sdk/google), Composio API, Zod

---

### Task 1: Model Router

**Files:**
- Create: `src/modules/agent/model-router.ts`
- Modify: `src/modules/agent/engine.ts`
- Modify: `src/modules/scheduler/executor.ts`
- Modify: `package.json` (add dependencies)

- [ ] **Step 1: Install provider SDKs**

```bash
pnpm add @ai-sdk/anthropic @ai-sdk/openai
```

- [ ] **Step 2: Create model-router.ts**

Create `src/modules/agent/model-router.ts`:

```typescript
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export type ModelTier = 'simple' | 'medium' | 'complex';

interface ModelSelection {
  model: LanguageModel;
  modelId: string;
  provider: string;
  tier: ModelTier;
}

const COMPLEX_KEYWORDS = /\b(plan|analyze|compare|report|across|investigate|audit|review|summarize.*from|combine.*data)\b/i;
const SIMPLE_PATTERNS = /^(hi|hello|hey|thanks|ok|yes|no|what can you|are you connected)\b/i;

export function selectModel(
  message: string,
  connectedServices: string[],
  options?: { previousStepFailed?: boolean; forceProvider?: string }
): ModelSelection {
  // If a provider is forced (e.g., user override), use it
  if (options?.forceProvider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return { model: anthropic('claude-sonnet-4-20250514'), modelId: 'claude-sonnet-4-20250514', provider: 'anthropic', tier: 'complex' };
  }
  if (options?.forceProvider === 'openai' && process.env.OPENAI_API_KEY) {
    return { model: openai('gpt-4o'), modelId: 'gpt-4o', provider: 'openai', tier: 'medium' };
  }

  // Escalate if previous step failed (model couldn't handle tools)
  if (options?.previousStepFailed) {
    if (process.env.ANTHROPIC_API_KEY) {
      return { model: anthropic('claude-sonnet-4-20250514'), modelId: 'claude-sonnet-4-20250514', provider: 'anthropic', tier: 'complex' };
    }
    if (process.env.OPENAI_API_KEY) {
      return { model: openai('gpt-4o'), modelId: 'gpt-4o', provider: 'openai', tier: 'medium' };
    }
  }

  // Simple: greetings, yes/no, basic Q&A
  if (SIMPLE_PATTERNS.test(message.trim()) && message.length < 100) {
    return { model: google('gemini-2.5-flash'), modelId: 'gemini-2.5-flash', provider: 'google', tier: 'simple' };
  }

  // Complex: multi-service keywords, long messages referencing multiple services
  const mentionedServices = connectedServices.filter(s => message.toLowerCase().includes(s.toLowerCase()));
  const isComplex = COMPLEX_KEYWORDS.test(message) || mentionedServices.length >= 2 || message.length > 500;

  if (isComplex) {
    if (process.env.ANTHROPIC_API_KEY) {
      return { model: anthropic('claude-sonnet-4-20250514'), modelId: 'claude-sonnet-4-20250514', provider: 'anthropic', tier: 'complex' };
    }
    if (process.env.OPENAI_API_KEY) {
      return { model: openai('gpt-4o'), modelId: 'gpt-4o', provider: 'openai', tier: 'complex' };
    }
  }

  // Medium: anything that involves tool use with connected services
  if (mentionedServices.length >= 1) {
    if (process.env.OPENAI_API_KEY) {
      return { model: openai('gpt-4o'), modelId: 'gpt-4o', provider: 'openai', tier: 'medium' };
    }
  }

  // Default: Gemini Flash
  return { model: google('gemini-2.5-flash'), modelId: 'gemini-2.5-flash', provider: 'google', tier: 'simple' };
}

/** For scheduler executor — always use medium tier */
export function selectSchedulerModel(): ModelSelection {
  if (process.env.OPENAI_API_KEY) {
    return { model: openai('gpt-4o'), modelId: 'gpt-4o', provider: 'openai', tier: 'medium' };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { model: anthropic('claude-sonnet-4-20250514'), modelId: 'claude-sonnet-4-20250514', provider: 'anthropic', tier: 'medium' };
  }
  return { model: google('gemini-2.5-flash'), modelId: 'gemini-2.5-flash', provider: 'google', tier: 'simple' };
}
```

- [ ] **Step 3: Integrate router into engine.ts**

In `src/modules/agent/engine.ts`:

Replace the imports and model selection:
```typescript
// Remove: import { google } from '@ai-sdk/google';
// Remove: const MODELS = ...
// Remove: const DEFAULT_MODEL = ...

// Add:
import { selectModel } from './model-router';
```

Replace the model selection in `createAgentStream`:
```typescript
  // Replace:
  // const modelId = input.modelOverride || DEFAULT_MODEL;
  // const modelName = MODELS[modelId] || MODELS[DEFAULT_MODEL];
  
  // With:
  const lastUserMsg = input.uiMessages.filter(m => m.role === 'user').pop();
  const userText = lastUserMsg?.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('') || '';
  const modelSelection = selectModel(userText, input.connectedServices || []);
  console.log(`[agent] Model selected: ${modelSelection.modelId} (${modelSelection.tier})`);
```

Replace the `streamText` model reference:
```typescript
  const result = streamText({
    model: modelSelection.model,
    // ... rest unchanged
```

Remove the `google` provider-specific options if the model isn't Google:
```typescript
    providerOptions: modelSelection.provider === 'google' ? {
      google: {
        thinkingConfig: { thinkingBudget: 1024 },
      },
    } : undefined,
```

- [ ] **Step 4: Integrate router into scheduler executor**

In `src/modules/scheduler/executor.ts`:

```typescript
// Replace: import { google } from '@ai-sdk/google';
// Add:
import { selectSchedulerModel } from '@/modules/agent/model-router';
```

In `executeScheduledTask`, replace the `generateText` call's model:
```typescript
    const schedulerModel = selectSchedulerModel();
    console.log(`[scheduler] Using model: ${schedulerModel.modelId}`);

    const result = await withTimeout(generateText({
      model: schedulerModel.model,
      // ... rest unchanged
```

Update the `trackUsage` call to use the selected model:
```typescript
    trackUsage(supabase, {
      // ...
      modelId: schedulerModel.modelId,
      modelProvider: schedulerModel.provider,
      // ...
    })
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: multi-provider model routing — Gemini/GPT-4o/Claude by task complexity"
```

---

### Task 2: Tool Simplification — Action Resolver

**Files:**
- Create: `src/modules/connections/platform/action-resolver.ts`
- Modify: `src/modules/connections/registry.ts`
- Modify: `src/app/actions.ts` (syncConnectionsAction)

- [ ] **Step 1: Create action-resolver.ts**

Create `src/modules/connections/platform/action-resolver.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export interface ResolvedAction {
  slug: string;
  displayName: string;
  description: string;
  parameters: Record<string, { type: string; description?: string; required?: boolean }>;
}

/**
 * Fetch top actions for an app from Composio API.
 */
export async function fetchActionsForApp(
  appName: string,
  limit: number = 20
): Promise<ResolvedAction[]> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return [];

  try {
    const resp = await fetch(
      `https://backend.composio.dev/api/v2/actions?apps=${appName}&limit=${limit}`,
      { headers: { 'x-api-key': apiKey } }
    );
    const data = await resp.json();
    const items = data.items || [];

    return items.map((item: any) => ({
      slug: item.name || '',
      displayName: item.displayName || item.name?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()) || '',
      description: item.description || '',
      parameters: extractParameters(item.parameters),
    }));
  } catch (error) {
    console.error(`[action-resolver] Failed to fetch actions for ${appName}:`, error);
    return [];
  }
}

function extractParameters(params: any): Record<string, { type: string; description?: string; required?: boolean }> {
  if (!params?.properties) return {};
  const result: Record<string, { type: string; description?: string; required?: boolean }> = {};
  const required = new Set(params.required || []);

  for (const [key, val] of Object.entries(params.properties as Record<string, any>)) {
    result[key] = {
      type: val.type || 'string',
      description: val.description,
      required: required.has(key),
    };
  }
  return result;
}

/**
 * Build a Zod schema from resolved action parameters.
 */
function buildZodSchema(parameters: ResolvedAction['parameters']): z.ZodType {
  const shape: Record<string, z.ZodType> = {};

  for (const [key, param] of Object.entries(parameters)) {
    let field: z.ZodType;
    switch (param.type) {
      case 'number':
      case 'integer':
        field = z.number();
        break;
      case 'boolean':
        field = z.boolean();
        break;
      case 'array':
        field = z.array(z.unknown());
        break;
      case 'object':
        field = z.record(z.string(), z.unknown());
        break;
      default:
        field = z.string();
    }

    if (param.description) {
      field = field.describe(param.description);
    }
    if (!param.required) {
      field = field.optional() as any;
    }
    shape[key] = field;
  }

  return z.object(shape);
}

/**
 * Create AI SDK tool wrappers from resolved actions.
 * Each wrapper calls COMPOSIO_MULTI_EXECUTE_TOOL under the hood.
 */
export function createActionTools(
  actions: ResolvedAction[],
  composioExecuteTool: any,
  toolPermissions: Record<string, string>
): Record<string, any> {
  const tools: Record<string, any> = {};

  for (const action of actions) {
    const perm = toolPermissions[action.slug];

    // Skip disabled tools entirely
    if (perm === 'disabled') continue;

    const toolName = action.slug.toLowerCase();

    tools[toolName] = tool({
      description: `${action.displayName}: ${action.description}`.slice(0, 500),
      inputSchema: buildZodSchema(action.parameters) as any,
      needsApproval: perm === 'confirm' ? true : undefined,
      execute: async (input: any) => {
        // Delegate to COMPOSIO_MULTI_EXECUTE_TOOL
        if (composioExecuteTool?.execute) {
          return composioExecuteTool.execute({
            tools: [{ tool_slug: action.slug, arguments: input }],
          });
        }
        return { error: 'Composio execute tool not available' };
      },
    });
  }

  return tools;
}
```

- [ ] **Step 2: Store resolved actions during sync**

In `src/app/actions.ts`, update `syncConnectionsAction`. After the sync loop that inserts connections, add:

```typescript
  // Resolve top actions for each connected app
  const { fetchActionsForApp } = await import('@/modules/connections/platform/action-resolver');

  for (const appName of activeApps) {
    try {
      const actions = await fetchActionsForApp(appName);
      if (actions.length > 0) {
        // Find the connection for this app
        const { data: conn } = await supabase
          .from('connections')
          .select('id, config')
          .eq('org_id', orgId)
          .eq('provider', appName)
          .single();

        if (conn) {
          const config = (conn.config || {}) as Record<string, any>;
          await supabase
            .from('connections')
            .update({ config: { ...config, resolvedActions: actions } })
            .eq('id', conn.id);
          console.log(`[sync] Resolved ${actions.length} actions for ${appName}`);
        }
      }
    } catch (err) {
      console.error(`[sync] Failed to resolve actions for ${appName}:`, err);
    }
  }
```

- [ ] **Step 3: Use resolved actions in registry**

In `src/modules/connections/registry.ts`, add import:
```typescript
import { createActionTools } from './platform/action-resolver';
import type { ResolvedAction } from './platform/action-resolver';
```

After loading composioTools and building toolPermissions, add:
```typescript
      // Create direct tool wrappers from pre-resolved actions
      const composioExecuteTool = composioTools['COMPOSIO_MULTI_EXECUTE_TOOL'];
      for (const conn of platformConnections) {
        const resolvedActions = (conn.config as any)?.resolvedActions as ResolvedAction[] | undefined;
        if (resolvedActions?.length) {
          const actionTools = createActionTools(resolvedActions, composioExecuteTool, toolPermissions);
          Object.assign(allTools, actionTools);
          console.log(`[registry] Created ${Object.keys(actionTools).length} direct tools for ${conn.name}`);
        }
      }

      // Still include meta-tools as fallback
      for (const [name, tool] of Object.entries(composioTools)) {
        if (!allTools[name]) {
          // ... existing logic for COMPOSIO_MULTI_EXECUTE_TOOL with needsApproval
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pre-resolve Composio actions into direct AI SDK tool wrappers"
```

---

### Task 3: Tool Allow/Deny Filtering

**Files:**
- Modify: `src/modules/connections/registry.ts`

- [ ] **Step 1: Filter disabled tools from the model's view**

In `src/modules/connections/registry.ts`, the resolved action tools already skip `disabled` actions (handled in `createActionTools`). Now update the meta-tool handling.

For COMPOSIO_MULTI_EXECUTE_TOOL, update the `needsApproval` function to also block disabled tools:

```typescript
        if (name === 'COMPOSIO_MULTI_EXECUTE_TOOL' && !options?.skipApproval) {
          const disabledSlugs = new Set(
            Object.entries(toolPermissions)
              .filter(([_, perm]) => perm === 'disabled')
              .map(([slug]) => slug)
          );

          allTools[name] = {
            ...tool,
            execute: async (input: any) => {
              // Block disabled slugs before execution
              const inputTools: any[] = input?.tools || [];
              const blocked = inputTools.filter(t => disabledSlugs.has(t?.tool_slug));
              if (blocked.length > 0) {
                return {
                  error: `The following actions are disabled by your admin: ${blocked.map(t => t.tool_slug).join(', ')}`,
                };
              }
              // Call original execute
              return tool.execute(input);
            },
            needsApproval: (input: any) => {
              const inputTools: any[] = input?.tools || [];
              for (const t of inputTools) {
                const slug = t?.tool_slug || '';
                const perm = toolPermissions[slug];
                if (perm === 'disabled') return true; // Will be blocked by execute anyway
                if (perm === 'confirm') return true;
                if (perm === 'auto') continue;
                const action = slug.split('_').slice(1).join('_');
                if (action && !READ_VERBS.test(action)) return true;
              }
              return false;
            },
          };
        }
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/modules/connections/registry.ts
git commit -m "feat: enforce tool allow/deny — disabled tools blocked from model and execution"
```

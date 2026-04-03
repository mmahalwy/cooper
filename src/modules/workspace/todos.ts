/**
 * In-run todo tracking — gives Cooper a lightweight internal task list
 * for complex multi-step work without the overhead of the user-facing plan system.
 *
 * Inspired by Viktor's todos.md pattern: when tackling complex investigations,
 * create a checklist, tick off items as they complete, never lose track.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { saveNote, readNote } from './db';

export interface TodoItem {
  id: string;
  text: string;
  status: 'pending' | 'in-progress' | 'done' | 'skipped';
  note?: string;
}

function parseTodos(content: string): TodoItem[] {
  try {
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function serializeTodos(todos: TodoItem[]): string {
  return JSON.stringify(todos, null, 2);
}

const TODO_KEY_PREFIX = 'todos:';

export function createTodoTools(supabase: SupabaseClient, orgId: string, threadId: string) {
  const todoKey = `${TODO_KEY_PREFIX}${threadId}`;

  return {
    create_todos: tool({
      description: `Create an internal task list for complex multi-step work. Use this when tackling an investigation or task with 4+ distinct steps you want to track internally. Unlike plan_task (which is user-visible and requires approval), this is your private scratchpad — use it to stay organized on complex work.

Good use cases:
- Researching across multiple data sources and want to track what you've checked
- Debugging a problem with multiple hypotheses to investigate  
- Completing a task that requires gathering info from many places before synthesizing

Don't use for simple tasks or when plan_task is more appropriate (user needs to approve steps).`,
      inputSchema: z.object({
        title: z.string().describe('Brief title for this task list, e.g., "Cooper codebase analysis"'),
        items: z.array(z.object({
          id: z.string().describe('Short ID, e.g., "check-db", "read-auth", "analyze-memory"'),
          text: z.string().describe('What to do'),
        })).min(2).max(20),
      }),
      execute: async ({ title, items }) => {
        const todos: TodoItem[] = items.map(item => ({
          id: item.id,
          text: item.text,
          status: 'pending' as const,
        }));

        const content = serializeTodos(todos);
        await saveNote(supabase, orgId, todoKey, JSON.stringify({ title, todos }));

        return {
          created: true,
          title,
          totalItems: todos.length,
          message: `Todo list "${title}" created with ${todos.length} items. Use update_todo to track progress and read_todos to check status.`,
        };
      },
    }),

    update_todo: tool({
      description: 'Update the status of a todo item. Call after completing, skipping, or starting work on a step.',
      inputSchema: z.object({
        id: z.string().describe('The todo item ID to update'),
        status: z.enum(['in-progress', 'done', 'skipped']).describe('New status'),
        note: z.string().optional().describe('Optional note about what was found or why it was skipped'),
      }),
      execute: async ({ id, status, note }) => {
        const note_ = await readNote(supabase, orgId, todoKey);
        if (!note_) return { updated: false, error: 'No todo list found. Create one first with create_todos.' };

        let parsed: { title: string; todos: TodoItem[] };
        try {
          parsed = JSON.parse(note_.content);
        } catch {
          return { updated: false, error: 'Could not parse todo list.' };
        }

        const item = parsed.todos.find(t => t.id === id);
        if (!item) return { updated: false, error: `No todo item found with id "${id}".` };

        item.status = status;
        if (note) item.note = note;

        await saveNote(supabase, orgId, todoKey, JSON.stringify(parsed));

        const remaining = parsed.todos.filter(t => t.status === 'pending' || t.status === 'in-progress');
        return {
          updated: true,
          id,
          status,
          remaining: remaining.length,
          allDone: remaining.length === 0,
          message: remaining.length === 0 ? 'All todos complete!' : `${remaining.length} item(s) remaining.`,
        };
      },
    }),

    read_todos: tool({
      description: 'Read the current todo list to check progress. Use when you want to see what remains or review what was completed.',
      inputSchema: z.object({}),
      execute: async () => {
        const note_ = await readNote(supabase, orgId, todoKey);
        if (!note_) return { found: false, message: 'No todo list for this conversation.' };

        let parsed: { title: string; todos: TodoItem[] };
        try {
          parsed = JSON.parse(note_.content);
        } catch {
          return { found: false, error: 'Could not parse todo list.' };
        }

        const byStatus = {
          pending: parsed.todos.filter(t => t.status === 'pending'),
          'in-progress': parsed.todos.filter(t => t.status === 'in-progress'),
          done: parsed.todos.filter(t => t.status === 'done'),
          skipped: parsed.todos.filter(t => t.status === 'skipped'),
        };

        return {
          found: true,
          title: parsed.title,
          todos: parsed.todos,
          summary: {
            total: parsed.todos.length,
            done: byStatus.done.length,
            pending: byStatus.pending.length,
            inProgress: byStatus['in-progress'].length,
            skipped: byStatus.skipped.length,
          },
        };
      },
    }),
  };
}

/**
 * Workspace tools — give the agent a persistent desk for notes and files.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { saveNote, readNote, listNotes, deleteNote, saveFile, listFiles } from './db';

export function createWorkspaceTools(
  supabase: SupabaseClient,
  orgId: string,
  threadId: string,
) {
  return {
    // -----------------------------------------------------------------------
    // Notes — quick key/value scratchpad
    // -----------------------------------------------------------------------
    save_note: tool({
      description: `Save a persistent note by key. Notes survive across conversations and are org-wide.
Use for: project status, team info, recurring checklists, accumulated data, meeting notes, anything you want to recall later.
If the key already exists, the content is replaced.`,
      inputSchema: z.object({
        key: z.string().describe('Short kebab-case key, e.g. "project-status", "team-roster", "weekly-metrics"'),
        content: z.string().describe('The note content (plain text or markdown)'),
      }),
      execute: async ({ key, content }) => {
        try {
          const note = await saveNote(supabase, orgId, key, content);
          if (!note) return { saved: false, error: 'Failed to save note' };
          return {
            saved: true,
            key: note.key,
            message: `Note "${note.key}" saved (${content.length} chars).`,
          };
        } catch (error) {
          return { saved: false, error: String(error) };
        }
      },
    }),

    read_note: tool({
      description: `Read a saved note by key. Use when you need to recall information saved in a previous conversation.`,
      inputSchema: z.object({
        key: z.string().describe('The key of the note to read'),
      }),
      execute: async ({ key }) => {
        try {
          const note = await readNote(supabase, orgId, key);
          if (!note) return { found: false, message: `No note found with key "${key}".` };
          return {
            found: true,
            key: note.key,
            content: note.content,
            updatedAt: note.updated_at,
          };
        } catch (error) {
          return { found: false, error: String(error) };
        }
      },
    }),

    list_notes: tool({
      description: `List all saved workspace notes. Shows keys and preview of each note. Use to see what you have stored.`,
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const notes = await listNotes(supabase, orgId);
          if (notes.length === 0) {
            return { notes: [], message: 'No workspace notes yet.' };
          }
          return {
            notes: notes.map((n) => ({
              key: n.key,
              preview: n.content.slice(0, 200) + (n.content.length > 200 ? '…' : ''),
              updatedAt: n.updated_at,
            })),
            message: `Found ${notes.length} note(s).`,
          };
        } catch (error) {
          return { notes: [], error: String(error) };
        }
      },
    }),

    delete_note: tool({
      description: `Delete a workspace note by key. Use when a note is outdated or no longer needed.`,
      inputSchema: z.object({
        key: z.string().describe('The key of the note to delete'),
      }),
      execute: async ({ key }) => {
        try {
          const success = await deleteNote(supabase, orgId, key);
          if (!success) return { deleted: false, error: 'Failed to delete note' };
          return { deleted: true, message: `Note "${key}" deleted.` };
        } catch (error) {
          return { deleted: false, error: String(error) };
        }
      },
    }),

    // -----------------------------------------------------------------------
    // Files — larger workspace documents
    // -----------------------------------------------------------------------
    save_workspace_file: tool({
      description: `Save a text file to the workspace. Use for larger content like reports, code, data exports, or drafts.
Files can be org-wide (visible in every conversation) or thread-scoped (visible only in this conversation).
If a file with the same name already exists in the same scope, it is overwritten.`,
      inputSchema: z.object({
        filename: z.string().describe('File name with extension, e.g. "report.md", "data.csv", "analysis.py"'),
        content: z.string().describe('The file content'),
        threadScoped: z.boolean().default(false).describe('If true, file is scoped to this conversation only. Default: org-wide.'),
      }),
      execute: async ({ filename, content, threadScoped }) => {
        try {
          const file = await saveFile(supabase, orgId, {
            filename,
            content,
            threadId: threadScoped ? threadId : undefined,
          });
          if (!file) return { saved: false, error: 'Failed to save file' };
          return {
            saved: true,
            fileId: file.id,
            filename: file.filename,
            sizeBytes: file.size_bytes,
            scope: threadScoped ? 'thread' : 'org',
            message: `File "${file.filename}" saved (${file.size_bytes} bytes, ${threadScoped ? 'thread-scoped' : 'org-wide'}).`,
          };
        } catch (error) {
          return { saved: false, error: String(error) };
        }
      },
    }),

    list_workspace_files: tool({
      description: `List files in the workspace. Shows both org-wide files and files scoped to the current conversation.`,
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const files = await listFiles(supabase, orgId, threadId);
          if (files.length === 0) {
            return { files: [], message: 'No workspace files yet.' };
          }
          return {
            files: files.map((f) => ({
              id: f.id,
              filename: f.filename,
              mimeType: f.mime_type,
              sizeBytes: f.size_bytes,
              scope: f.thread_id ? 'thread' : 'org',
              updatedAt: f.updated_at,
            })),
            message: `Found ${files.length} file(s).`,
          };
        } catch (error) {
          return { files: [], error: String(error) };
        }
      },
    }),
  };
}

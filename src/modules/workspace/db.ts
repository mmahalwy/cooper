/**
 * Workspace database operations — persistent notes and files for the agent.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { WorkspaceFile, WorkspaceNote } from '@/lib/types';

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function saveNote(
  supabase: SupabaseClient,
  orgId: string,
  key: string,
  content: string,
  metadata: Record<string, unknown> = {},
): Promise<WorkspaceNote | null> {
  const { data, error } = await supabase
    .from('workspace_notes')
    .upsert(
      {
        org_id: orgId,
        key: key.toLowerCase().trim(),
        content,
        metadata,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,key' },
    )
    .select('*')
    .single();

  if (error) {
    console.error('[workspace] Failed to save note:', error);
    return null;
  }
  return data as WorkspaceNote;
}

export async function readNote(
  supabase: SupabaseClient,
  orgId: string,
  key: string,
): Promise<WorkspaceNote | null> {
  const { data, error } = await supabase
    .from('workspace_notes')
    .select('*')
    .eq('org_id', orgId)
    .eq('key', key.toLowerCase().trim())
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    console.error('[workspace] Failed to read note:', error);
    return null;
  }
  return data as WorkspaceNote;
}

export async function listNotes(
  supabase: SupabaseClient,
  orgId: string,
): Promise<WorkspaceNote[]> {
  const { data, error } = await supabase
    .from('workspace_notes')
    .select('*')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[workspace] Failed to list notes:', error);
    return [];
  }
  return data as WorkspaceNote[];
}

export async function deleteNote(
  supabase: SupabaseClient,
  orgId: string,
  key: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('workspace_notes')
    .delete()
    .eq('org_id', orgId)
    .eq('key', key.toLowerCase().trim());

  if (error) {
    console.error('[workspace] Failed to delete note:', error);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export async function saveFile(
  supabase: SupabaseClient,
  orgId: string,
  file: {
    filename: string;
    content: string;
    threadId?: string;
    mimeType?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<WorkspaceFile | null> {
  const sizeBytes = new TextEncoder().encode(file.content).length;

  // Check for existing file to update (match by org + filename + scope)
  let query = supabase
    .from('workspace_files')
    .select('id')
    .eq('org_id', orgId)
    .eq('filename', file.filename);

  if (file.threadId) {
    query = query.eq('thread_id', file.threadId);
  } else {
    query = query.is('thread_id', null);
  }

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    // Update in place
    const { data, error } = await supabase
      .from('workspace_files')
      .update({
        content: file.content,
        mime_type: file.mimeType || 'text/plain',
        size_bytes: sizeBytes,
        metadata: file.metadata || {},
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      console.error('[workspace] Failed to update file:', error);
      return null;
    }
    return data as WorkspaceFile;
  }

  // Insert new
  const { data, error } = await supabase
    .from('workspace_files')
    .insert({
      org_id: orgId,
      thread_id: file.threadId || null,
      filename: file.filename,
      content: file.content,
      mime_type: file.mimeType || 'text/plain',
      size_bytes: sizeBytes,
      metadata: file.metadata || {},
    })
    .select('*')
    .single();

  if (error) {
    console.error('[workspace] Failed to save file:', error);
    return null;
  }
  return data as WorkspaceFile;
}

export async function readFile(
  supabase: SupabaseClient,
  orgId: string,
  filename: string,
  threadId?: string,
): Promise<WorkspaceFile | null> {
  let query = supabase
    .from('workspace_files')
    .select('*')
    .eq('org_id', orgId)
    .eq('filename', filename);

  if (threadId) {
    query = query.eq('thread_id', threadId);
  } else {
    query = query.is('thread_id', null);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('[workspace] Failed to read file:', error);
    return null;
  }
  return data as WorkspaceFile | null;
}

export async function listFiles(
  supabase: SupabaseClient,
  orgId: string,
  threadId?: string,
): Promise<WorkspaceFile[]> {
  let query = supabase
    .from('workspace_files')
    .select('id, org_id, thread_id, filename, mime_type, size_bytes, metadata, created_at, updated_at')
    .eq('org_id', orgId);

  if (threadId) {
    // Show both thread-scoped and org-wide files
    query = query.or(`thread_id.eq.${threadId},thread_id.is.null`);
  }

  const { data, error } = await query.order('updated_at', { ascending: false });

  if (error) {
    console.error('[workspace] Failed to list files:', error);
    return [];
  }
  return data as WorkspaceFile[];
}

export async function deleteFile(
  supabase: SupabaseClient,
  fileId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('workspace_files')
    .delete()
    .eq('id', fileId);

  if (error) {
    console.error('[workspace] Failed to delete file:', error);
    return false;
  }
  return true;
}

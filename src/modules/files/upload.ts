/**
 * File upload utilities for chat attachments.
 */

import { SupabaseClient } from '@supabase/supabase-js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/csv', 'text/markdown',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
  if (!ALLOWED_TYPES.includes(file.type)) return 'File type not supported';
  return null;
}

export async function uploadFile(
  supabase: SupabaseClient,
  file: File,
  orgId: string,
  userId: string,
): Promise<{ path: string; url: string } | { error: string }> {
  const error = validateFile(file);
  if (error) return { error };

  const ext = file.name.split('.').pop() || 'bin';
  const path = `${orgId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(path, file, { contentType: file.type });

  if (uploadError) return { error: 'Upload failed: ' + uploadError.message };

  const { data: { publicUrl } } = supabase.storage
    .from('attachments')
    .getPublicUrl(path);

  return { path, url: publicUrl };
}

export async function getSignedUrl(
  supabase: SupabaseClient,
  path: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('attachments')
    .createSignedUrl(path, 3600); // 1 hour

  return error ? null : data.signedUrl;
}

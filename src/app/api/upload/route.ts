import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateFile } from '@/modules/files/upload';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 400 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const validationError = validateFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const ext = file.name.split('.').pop() || 'bin';
  const path = `${profile.org_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Record metadata
  await supabase.from('attachments').insert({
    org_id: profile.org_id,
    user_id: user.id,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    storage_path: path,
  });

  // Get signed URL
  const { data: urlData } = await supabase.storage
    .from('attachments')
    .createSignedUrl(path, 3600);

  return NextResponse.json({
    name: file.name,
    type: file.type,
    size: file.size,
    url: urlData?.signedUrl || '',
    storagePath: path,
  });
}

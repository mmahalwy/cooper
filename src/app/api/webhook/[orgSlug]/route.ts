import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role client for webhook processing (no user auth)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;

  // Get org by slug
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single();

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  // Verify webhook secret
  const authHeader = request.headers.get('authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');

  if (!providedSecret) {
    return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
  }

  const { data: webhook } = await supabaseAdmin
    .from('webhooks')
    .select('id, is_active')
    .eq('org_id', org.id)
    .eq('secret', providedSecret)
    .eq('is_active', true)
    .single();

  if (!webhook) {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 403 });
  }

  // Parse body
  const body = await request.json();
  const message = body.message || body.text || body.content;

  if (!message) {
    return NextResponse.json({ error: 'No message provided' }, { status: 400 });
  }

  // Get a user in the org to attribute the thread to
  const { data: orgUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('org_id', org.id)
    .limit(1)
    .single();

  if (!orgUser) {
    return NextResponse.json({ error: 'No users in organization' }, { status: 500 });
  }

  // Create thread for this webhook
  const { data: thread } = await supabaseAdmin
    .from('threads')
    .insert({
      org_id: org.id,
      user_id: orgUser.id,
      title: `Webhook: ${body.source || 'External'}`,
    })
    .select('id')
    .single();

  if (!thread) {
    return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 });
  }

  // Store user message
  await supabaseAdmin.from('messages').insert({
    thread_id: thread.id,
    role: 'user',
    content: message,
  });

  // Update webhook last_triggered
  await supabaseAdmin
    .from('webhooks')
    .update({ last_triggered_at: new Date().toISOString() })
    .eq('id', webhook.id);

  return NextResponse.json({
    success: true,
    thread_id: thread.id,
    message: 'Webhook received. Cooper will process this asynchronously.',
  });
}

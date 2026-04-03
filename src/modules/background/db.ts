import { SupabaseClient } from '@supabase/supabase-js';

export interface BackgroundJob {
  id: string;
  org_id: string;
  user_id: string;
  thread_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  goal: string;
  steps: BackgroundJobStep[];
  current_step: number;
  result: string | null;
  error: string | null;
  inngest_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackgroundJobStep {
  id: string;
  action: string;
  integration: string | null;
  status: 'pending' | 'running' | 'done' | 'failed';
  output: string | null;
}

export async function createBackgroundJob(
  supabase: SupabaseClient,
  job: {
    org_id: string;
    user_id: string;
    thread_id: string;
    goal: string;
    steps: BackgroundJobStep[];
    inngest_event_id?: string;
  }
): Promise<BackgroundJob | null> {
  const { data, error } = await supabase
    .from('background_jobs')
    .insert(job)
    .select('*')
    .single();

  if (error) {
    console.error('[background] Failed to create job:', error);
    return null;
  }
  return data as BackgroundJob;
}

export async function getBackgroundJob(
  supabase: SupabaseClient,
  jobId: string
): Promise<BackgroundJob | null> {
  const { data, error } = await supabase
    .from('background_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) return null;
  return data as BackgroundJob;
}

export async function updateJobStep(
  supabase: SupabaseClient,
  jobId: string,
  stepId: string,
  status: BackgroundJobStep['status'],
  output?: string
): Promise<void> {
  const job = await getBackgroundJob(supabase, jobId);
  if (!job) return;

  const updatedSteps = job.steps.map((step) =>
    step.id === stepId ? { ...step, status, output: output || step.output } : step
  );

  const currentStep = updatedSteps.findIndex(s => s.status === 'running' || s.status === 'pending');

  await supabase
    .from('background_jobs')
    .update({
      steps: updatedSteps,
      current_step: currentStep === -1 ? updatedSteps.length : currentStep,
      status: 'running',
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

export async function updateJobStatus(
  supabase: SupabaseClient,
  jobId: string,
  status: BackgroundJob['status'],
  result?: string,
  error?: string
): Promise<void> {
  await supabase
    .from('background_jobs')
    .update({
      status,
      result: result || null,
      error: error || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

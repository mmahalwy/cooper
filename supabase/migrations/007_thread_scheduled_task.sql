-- Link threads to their scheduled task so we can filter them from the sidebar
alter table public.threads
  add column scheduled_task_id uuid references public.scheduled_tasks(id) on delete set null;

-- Index for fast lookups when viewing runs for a scheduler
create index idx_threads_scheduled_task_id on public.threads(scheduled_task_id) where scheduled_task_id is not null;

import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { backgroundTask } from '@/inngest/functions/background-task';
import { scheduledTaskChecker, scheduledTaskExecutor } from '@/inngest/functions/scheduled-task';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    backgroundTask,
    scheduledTaskChecker,
    scheduledTaskExecutor,
  ],
});

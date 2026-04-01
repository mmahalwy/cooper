'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DownloadIcon, FileTextIcon, CodeIcon } from 'lucide-react';
import { exportThreadAction } from '@/app/actions';

export function ExportButton({ threadId }: { threadId: string }) {
  const [isPending, startTransition] = useTransition();

  function download(format: 'markdown' | 'json') {
    startTransition(async () => {
      const result = await exportThreadAction(threadId, format);
      if ('error' in result) return;

      const blob = new Blob([result.content], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" disabled={isPending} />}
      >
        <DownloadIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => download('markdown')}>
          <FileTextIcon className="size-4 mr-2" /> Export as Markdown
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => download('json')}>
          <CodeIcon className="size-4 mr-2" /> Export as JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckIcon, CopyIcon } from 'lucide-react';

export function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
      onClick={() => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
    </Button>
  );
}

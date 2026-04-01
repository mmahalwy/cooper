'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckIcon, CopyIcon } from 'lucide-react';

interface CodeBlockProps {
  children: string;
  language?: string;
}

export function CodeBlock({ children, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative my-3 rounded-lg border bg-muted/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {language || 'code'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          onClick={handleCopy}
        >
          {copied ? (
            <><CheckIcon className="size-3" /> Copied</>
          ) : (
            <><CopyIcon className="size-3" /> Copy</>
          )}
        </Button>
      </div>
      {/* Code */}
      <pre className="overflow-x-auto p-3 text-sm">
        <code>{children}</code>
      </pre>
    </div>
  );
}

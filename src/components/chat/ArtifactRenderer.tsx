'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  CodeIcon,
  TableIcon,
  GlobeIcon,
  TerminalIcon,
  FileIcon,
  CopyIcon,
  CheckIcon,
  DownloadIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { BundledLanguage } from 'shiki';
import { CodeBlockContent } from '@/components/ai-elements/code-block';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArtifactData {
  id: string;
  type: 'code' | 'table' | 'html' | 'terminal' | 'file';
  title: string;
  content: string;
  language?: string;
  filename?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_META: Record<ArtifactData['type'], { icon: typeof CodeIcon; label: string }> = {
  code:     { icon: CodeIcon,     label: 'Code' },
  table:    { icon: TableIcon,    label: 'Table' },
  html:     { icon: GlobeIcon,    label: 'HTML' },
  terminal: { icon: TerminalIcon, label: 'Terminal' },
  file:     { icon: FileIcon,     label: 'File' },
};

function useCopyToClipboard(text: string, timeout = 2000) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), timeout);
    } catch {
      /* noop */
    }
  }, [text, timeout]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return { copied, copy };
}

function downloadBlob(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Sub-renderers
// ---------------------------------------------------------------------------

function CodeArtifact({ content, language }: { content: string; language?: string }) {
  const lang = (language || 'text') as BundledLanguage;
  return (
    <div className="overflow-auto max-h-[28rem]">
      <CodeBlockContent code={content} language={lang} showLineNumbers />
    </div>
  );
}

function TableArtifact({ content }: { content: string }) {
  return (
    <div
      className="overflow-auto max-h-[28rem] text-sm [&_table]:w-full [&_table]:border-collapse [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground [&_th]:border-b [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-border/50 [&_tr:nth-child(even)]:bg-muted/30"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

function HtmlArtifact({ content }: { content: string }) {
  const srcDoc = useMemo(
    () =>
      `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>body{margin:0;font-family:system-ui,sans-serif;}</style></head>
<body>${content}</body></html>`,
    [content],
  );

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      className="w-full min-h-[16rem] max-h-[28rem] border-0"
      title="HTML preview"
    />
  );
}

function TerminalArtifact({ content }: { content: string }) {
  return (
    <div className="overflow-auto max-h-[28rem] bg-zinc-950 p-4">
      <pre className="font-mono text-sm leading-relaxed text-green-400 whitespace-pre-wrap break-words">
        {content}
      </pre>
    </div>
  );
}

function FileArtifact({ content, filename }: { content: string; filename?: string }) {
  const name = filename || 'download.txt';
  const size = new Blob([content]).size;

  return (
    <div className="flex items-center gap-4 p-4">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted">
        <FileIcon className="size-6 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{name}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(size)}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => downloadBlob(content, name)}
      >
        <DownloadIcon className="size-3.5" />
        Download
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ArtifactRenderer({ data }: { data: ArtifactData }) {
  const [collapsed, setCollapsed] = useState(false);
  const meta = TYPE_META[data.type];
  const Icon = meta.icon;
  const { copied, copy } = useCopyToClipboard(data.content);

  const showCopy = data.type !== 'file';
  const showDownload = data.type === 'code' || data.type === 'file';

  return (
    <div className="my-3 overflow-hidden rounded-lg border bg-background shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {meta.label}
        </span>
        <span className="mx-1 text-border">·</span>
        <span className="flex-1 truncate text-sm font-medium">{data.title}</span>

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          {showCopy && (
            <Button variant="ghost" size="icon" className="size-7" onClick={copy}>
              {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            </Button>
          )}
          {showDownload && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() =>
                downloadBlob(
                  data.content,
                  data.filename || `${data.title.toLowerCase().replace(/\s+/g, '-')}.${data.language || 'txt'}`,
                )
              }
            >
              <DownloadIcon className="size-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? <ChevronDownIcon className="size-3.5" /> : <ChevronUpIcon className="size-3.5" />}
          </Button>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div>
          {data.type === 'code' && <CodeArtifact content={data.content} language={data.language} />}
          {data.type === 'table' && <TableArtifact content={data.content} />}
          {data.type === 'html' && <HtmlArtifact content={data.content} />}
          {data.type === 'terminal' && <TerminalArtifact content={data.content} />}
          {data.type === 'file' && <FileArtifact content={data.content} filename={data.filename} />}
        </div>
      )}
    </div>
  );
}

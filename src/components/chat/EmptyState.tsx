'use client';

import {
  BugIcon,
  CalendarClockIcon,
  FileTextIcon,
  SearchIcon,
  SparklesIcon,
  TrendingUpIcon,
  ZapIcon,
} from 'lucide-react';

const suggestions = [
  {
    icon: TrendingUpIcon,
    label: 'Pull this week\'s metrics',
    prompt: 'Pull this week\'s key metrics and give me a summary with trends compared to last week.',
  },
  {
    icon: SearchIcon,
    label: 'Search across our tools',
    prompt: 'Search for the latest updates on our most important project across all connected tools.',
  },
  {
    icon: CalendarClockIcon,
    label: 'Set up a recurring report',
    prompt: 'Set up a daily standup summary that runs every weekday at 9am.',
  },
  {
    icon: BugIcon,
    label: 'Investigate an issue',
    prompt: 'Check for any critical errors or issues in our monitoring tools from the past 24 hours.',
  },
  {
    icon: FileTextIcon,
    label: 'Draft a document',
    prompt: 'Help me draft a project update document for this week\'s progress.',
  },
  {
    icon: ZapIcon,
    label: 'What can you do?',
    prompt: 'What integrations are you connected to? What kinds of tasks can you help me with?',
  },
];

interface EmptyStateProps {
  onSuggestionClick?: (prompt: string) => void;
}

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
          <SparklesIcon className="size-6 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">What can I help with?</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          I can search your connected tools, analyze data, schedule tasks, and more. Try one of these to get started:
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-w-2xl w-full">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onSuggestionClick?.(s.prompt)}
            className="flex items-center gap-2.5 rounded-lg border bg-background p-3 text-left text-sm transition-colors hover:bg-muted hover:border-primary/30 group"
          >
            <s.icon className="size-4 text-muted-foreground group-hover:text-primary shrink-0" />
            <span className="text-muted-foreground group-hover:text-foreground">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

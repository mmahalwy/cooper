'use client';

import {
  PromptInput,
  PromptInputTextarea,
  PromptInputButton,
} from '@/components/ai-elements/prompt-input';
import { ArrowUpIcon, SquareIcon } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

export function ChatInput({ onSend, onStop, disabled, isStreaming }: ChatInputProps) {
  return (
    <div className="border-t bg-background p-4">
      <div className="mx-auto max-w-3xl">
        <PromptInput
          onSubmit={(message) => {
            if (message.text.trim()) {
              onSend(message.text.trim());
            }
          }}
        >
          <PromptInputTextarea
            placeholder="Message Cooper..."
            disabled={disabled && !isStreaming}
          />
          {isStreaming ? (
            <PromptInputButton type="button" onClick={onStop} tooltip="Stop">
              <SquareIcon />
            </PromptInputButton>
          ) : (
            <PromptInputButton type="submit" tooltip="Send" disabled={disabled}>
              <ArrowUpIcon />
            </PromptInputButton>
          )}
        </PromptInput>
      </div>
    </div>
  );
}

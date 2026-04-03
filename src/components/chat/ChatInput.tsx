'use client';

import { memo, useCallback, useRef, useState } from 'react';
import type { FileUIPart } from 'ai';
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from '@/components/ai-elements/attachments';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
} from '@/components/ai-elements/model-selector';
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input';
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionAddScreenshot,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input';
import { CheckIcon, GlobeIcon, Loader2Icon } from 'lucide-react';

const models = [
  {
    chef: 'Auto',
    chefSlug: 'google',
    id: 'auto',
    name: 'Auto',
    providers: ['google', 'openai', 'anthropic'],
  },
  {
    chef: 'Google',
    chefSlug: 'google',
    id: 'gemini-flash',
    name: 'Gemini 2.5 Flash',
    providers: ['google'],
  },
  {
    chef: 'Google',
    chefSlug: 'google',
    id: 'gemini-pro',
    name: 'Gemini 2.5 Pro',
    providers: ['google'],
  },
];

interface ChatInputProps {
  onSend: (message: { text: string; files?: FileUIPart[]; modelOverride?: string }) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  status?: string;
}

/**
 * Uploads a single file to Supabase Storage via the /api/upload endpoint.
 * Returns a FileUIPart with a signed URL or null on failure.
 */
async function uploadFileToStorage(file: FileUIPart): Promise<FileUIPart | null> {
  // Convert data URL back to a File for FormData upload
  if (!file.url) return null;

  try {
    const response = await fetch(file.url);
    const blob = await response.blob();
    const fileObj = new File([blob], file.filename || 'attachment', { type: file.mediaType });

    const formData = new FormData();
    formData.append('file', fileObj);

    const uploadResponse = await fetch('/api/upload', { method: 'POST', body: formData });
    const result = await uploadResponse.json();

    if (result.error || !result.url) return null;

    return {
      type: 'file',
      url: result.url,
      mediaType: result.type || file.mediaType,
      filename: result.name || file.filename,
    };
  } catch {
    return null;
  }
}

const AttachmentItem = memo(({ attachment, onRemove }: {
  attachment: any;
  onRemove: (id: string) => void;
}) => {
  const handleRemove = useCallback(() => onRemove(attachment.id), [onRemove, attachment.id]);
  return (
    <Attachment data={attachment} onRemove={handleRemove}>
      <AttachmentPreview />
      <AttachmentRemove />
    </Attachment>
  );
});
AttachmentItem.displayName = 'AttachmentItem';

const ModelItem = memo(({ m, selectedModel, onSelect }: {
  m: (typeof models)[0];
  selectedModel: string;
  onSelect: (id: string) => void;
}) => {
  const handleSelect = useCallback(() => onSelect(m.id), [onSelect, m.id]);
  return (
    <ModelSelectorItem onSelect={handleSelect} value={m.id}>
      <ModelSelectorLogo provider={m.chefSlug} />
      <ModelSelectorName>{m.name}</ModelSelectorName>
      <ModelSelectorLogoGroup>
        {m.providers.map((provider) => (
          <ModelSelectorLogo key={provider} provider={provider} />
        ))}
      </ModelSelectorLogoGroup>
      {selectedModel === m.id ? (
        <CheckIcon className="ml-auto size-4" />
      ) : (
        <div className="ml-auto size-4" />
      )}
    </ModelSelectorItem>
  );
});
ModelItem.displayName = 'ModelItem';

function PromptInputAttachmentsDisplay() {
  const attachments = usePromptInputAttachments();
  const handleRemove = useCallback((id: string) => attachments.remove(id), [attachments]);

  if (attachments.files.length === 0) return null;

  return (
    <Attachments variant="inline">
      {attachments.files.map((attachment) => (
        <AttachmentItem attachment={attachment} key={attachment.id} onRemove={handleRemove} />
      ))}
    </Attachments>
  );
}

export function ChatInput({ onSend, onStop, disabled, isStreaming, status }: ChatInputProps) {
  const [model, setModel] = useState('auto');
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const selectedModelData = models.find((m) => m.id === model);

  const handleModelSelect = useCallback((id: string) => {
    setModel(id);
    setModelSelectorOpen(false);
  }, []);

  const handleSubmit = useCallback(async (message: PromptInputMessage) => {
    if (!message.text?.trim() && message.files.length === 0) return;

    // If there are files, upload them to storage first
    if (message.files.length > 0) {
      setUploading(true);
      try {
        const uploadedFiles = await Promise.all(
          message.files.map((file) => uploadFileToStorage(file))
        );

        const successfulUploads = uploadedFiles.filter(
          (f): f is FileUIPart => f !== null
        );

        onSend({
          text: message.text?.trim() || '',
          files: successfulUploads.length > 0 ? successfulUploads : undefined,
          modelOverride: model,
        });
      } finally {
        setUploading(false);
      }
    } else {
      onSend({ text: message.text.trim(), modelOverride: model });
    }
  }, [model, onSend]);

  const chatStatus = (status || 'ready') as 'submitted' | 'streaming' | 'ready' | 'error';

  return (
    <div className="bg-background px-4 pb-4 pt-2">
      <div className="mx-auto max-w-3xl">
        <PromptInputProvider>
          <PromptInput globalDrop multiple onSubmit={handleSubmit}>
            <PromptInputAttachmentsDisplay />
            <PromptInputBody>
              <PromptInputTextarea placeholder="Message Cooper..." />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments />
                    <PromptInputActionAddScreenshot />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
                {uploading && (
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Loader2Icon className="size-3 animate-spin" />
                    <span>Uploading…</span>
                  </div>
                )}
                <PromptInputButton
                  disabled={Boolean(disabled) || uploading}
                  onClick={() => setModelSelectorOpen(true)}
                  variant="ghost"
                >
                  <GlobeIcon className="size-4" />
                  <span>{selectedModelData?.name || 'Auto'}</span>
                </PromptInputButton>
                <ModelSelector onOpenChange={setModelSelectorOpen} open={modelSelectorOpen}>
                  <ModelSelectorContent className="sm:max-w-[420px]" title="Choose model">
                    <ModelSelectorInput placeholder="Search models..." />
                    <ModelSelectorList>
                      <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                      <ModelSelectorGroup heading="Available models">
                        {models.map((m) => (
                          <ModelItem
                            key={m.id}
                            m={m}
                            onSelect={handleModelSelect}
                            selectedModel={model}
                          />
                        ))}
                      </ModelSelectorGroup>
                    </ModelSelectorList>
                  </ModelSelectorContent>
                </ModelSelector>
              </PromptInputTools>
              <PromptInputSubmit status={uploading ? 'submitted' : chatStatus} />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
      </div>
    </div>
  );
}

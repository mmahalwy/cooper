'use client';

import { memo, useCallback, useState } from 'react';
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
  ModelSelectorTrigger,
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
import { CheckIcon, GlobeIcon } from 'lucide-react';

const models = [
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
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  status?: string;
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
  const [model, setModel] = useState(models[0].id);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  const selectedModelData = models.find((m) => m.id === model);

  const handleModelSelect = useCallback((id: string) => {
    setModel(id);
    setModelSelectorOpen(false);
  }, []);

  const handleSubmit = useCallback((message: PromptInputMessage) => {
    if (!message.text?.trim()) return;
    onSend(message.text.trim());
  }, [onSend]);

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
                <PromptInputButton>
                  <GlobeIcon size={16} />
                  <span>Search</span>
                </PromptInputButton>
                <ModelSelector open={modelSelectorOpen} onOpenChange={setModelSelectorOpen}>
                  <ModelSelectorTrigger>
                    {selectedModelData?.chefSlug && (
                      <ModelSelectorLogo provider={selectedModelData.chefSlug} />
                    )}
                    {selectedModelData?.name && (
                      <ModelSelectorName>{selectedModelData.name}</ModelSelectorName>
                    )}
                  </ModelSelectorTrigger>
                  <ModelSelectorContent>
                    <ModelSelectorInput placeholder="Search models..." />
                    <ModelSelectorList>
                      <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                      {['Google'].map((chef) => (
                        <ModelSelectorGroup heading={chef} key={chef}>
                          {models
                            .filter((m) => m.chef === chef)
                            .map((m) => (
                              <ModelItem
                                key={m.id}
                                m={m}
                                onSelect={handleModelSelect}
                                selectedModel={model}
                              />
                            ))}
                        </ModelSelectorGroup>
                      ))}
                    </ModelSelectorList>
                  </ModelSelectorContent>
                </ModelSelector>
              </PromptInputTools>
              <PromptInputSubmit status={chatStatus} />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
      </div>
    </div>
  );
}

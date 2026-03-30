'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface AddKnowledgeModalProps {
  opened: boolean;
  onClose: () => void;
  onAdd: (content: string) => void;
}

export function AddKnowledgeModal({ opened, onClose, onAdd }: AddKnowledgeModalProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    await onAdd(content.trim());
    setLoading(false);
    setContent('');
    onClose();
  };

  return (
    <Dialog open={opened} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Knowledge</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Textarea
            placeholder="e.g., Our sprint cycle is 2 weeks starting Monday. Deploy process requires PR approval from 2 reviewers."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Adding...' : 'Add knowledge'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

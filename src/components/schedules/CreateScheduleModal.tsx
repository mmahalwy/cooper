'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface CreateScheduleModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateScheduleModal({ opened, onClose, onCreated }: CreateScheduleModalProps) {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch('/api/schedules/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description.trim() }),
    });

    if (res.ok) {
      setParsed(await res.json());
    } else {
      setError('Failed to parse schedule');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!parsed) return;
    setLoading(true);

    const res = await fetch('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: parsed.name, cron: parsed.cron, prompt: parsed.prompt }),
    });

    setLoading(false);
    if (res.ok) {
      setDescription('');
      setParsed(null);
      onCreated();
      onClose();
    } else {
      const data = await res.text();
      setError(data || 'Failed to create schedule');
    }
  };

  return (
    <Dialog open={opened} onOpenChange={(open) => { if (!open) { onClose(); setParsed(null); setError(null); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Schedule</DialogTitle>
        </DialogHeader>

        {!parsed ? (
          <div className="flex flex-col gap-4">
            <Textarea
              placeholder='e.g., "Every Monday at 9am, summarize my open PRs and post to #engineering"'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleParse} disabled={loading || !description.trim()}>
              {loading ? 'Parsing...' : 'Parse schedule'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium">{parsed.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{parsed.humanReadable}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1">Cron expression</p>
              <code className="text-xs bg-muted px-2 py-1 rounded">{parsed.cron}</code>
            </div>
            <div>
              <p className="text-xs font-medium mb-1">Prompt</p>
              <p className="text-xs text-muted-foreground">{parsed.prompt}</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setParsed(null)}>Edit</Button>
              <Button className="flex-1" onClick={handleSave} disabled={loading}>
                {loading ? 'Saving...' : 'Save schedule'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

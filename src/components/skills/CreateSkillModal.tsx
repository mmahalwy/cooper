'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CreateSkillModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateSkillModal({ opened, onClose, onCreated }: CreateSkillModalProps) {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch('/api/skills/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description.trim() }),
    });

    if (res.ok) {
      setParsed(await res.json());
    } else {
      setError('Failed to parse skill description');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!parsed) return;
    setLoading(true);

    const res = await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    });

    setLoading(false);
    if (res.ok) {
      setDescription('');
      setParsed(null);
      onCreated();
      onClose();
    } else {
      setError('Failed to save skill');
    }
  };

  return (
    <Dialog open={opened} onOpenChange={(open) => { if (!open) { onClose(); setParsed(null); setError(null); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Skill</DialogTitle>
        </DialogHeader>

        {!parsed ? (
          <div className="flex flex-col gap-4">
            <Textarea
              placeholder='e.g., "When I ask for a sprint summary, pull tickets from Linear, group by assignee, include story points, and format as a markdown table"'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleParse} disabled={loading || !description.trim()}>
              {loading ? 'Parsing...' : 'Parse into skill'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium">{parsed.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{parsed.description}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1">Trigger</p>
              <p className="text-xs text-muted-foreground">{parsed.trigger}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1">Steps</p>
              <ol className="text-xs text-muted-foreground list-decimal list-inside">
                {parsed.steps?.map((s: any, i: number) => (
                  <li key={i}>{s.action}{s.toolName && <Badge variant="outline" className="ml-1 text-[10px]">{s.toolName}</Badge>}</li>
                ))}
              </ol>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setParsed(null)}>
                Edit
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={loading}>
                {loading ? 'Saving...' : 'Save skill'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

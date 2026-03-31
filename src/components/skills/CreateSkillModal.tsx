'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EyeIcon, PenIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseSkillAction, createSkillAction } from '@/app/actions';

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
  const [preview, setPreview] = useState(false);

  const handleParse = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const result = await parseSkillAction(description.trim());
      setParsed(result);
    } catch {
      setError('Failed to parse skill description');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!parsed) return;
    setLoading(true);

    const result = await createSkillAction(parsed);

    setLoading(false);
    if (result.success) {
      setDescription('');
      setParsed(null);
      onCreated();
      onClose();
    } else {
      setError(result.error || 'Failed to save skill');
    }
  };

  return (
    <Dialog open={opened} onOpenChange={(open) => { if (!open) { onClose(); setParsed(null); setError(null); setPreview(false); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Skill</DialogTitle>
        </DialogHeader>

        {!parsed ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Describe the workflow in plain English or markdown.
              </p>
              <div className="flex items-center gap-1 rounded-md border p-0.5">
                <button onClick={() => setPreview(false)} className={cn('rounded px-2 py-1 text-xs', !preview ? 'bg-muted font-medium' : 'text-muted-foreground')}>
                  <PenIcon className="inline-block size-3 mr-1" />Write
                </button>
                <button onClick={() => setPreview(true)} className={cn('rounded px-2 py-1 text-xs', preview ? 'bg-muted font-medium' : 'text-muted-foreground')}>
                  <EyeIcon className="inline-block size-3 mr-1" />Preview
                </button>
              </div>
            </div>

            {preview ? (
              <div className="min-h-[160px] rounded-md border p-3 prose prose-sm max-w-none">
                {description ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown> : <p className="text-muted-foreground italic">Nothing to preview</p>}
              </div>
            ) : (
              <Textarea
                placeholder={`e.g.,\n\n## Sprint Summary\n\nWhen I ask for a sprint summary:\n1. Pull tickets from Linear\n2. Group by assignee`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
            )}

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
            {parsed.outputFormat && (
              <div>
                <p className="text-xs font-medium mb-1">Output format</p>
                <p className="text-xs text-muted-foreground">{parsed.outputFormat}</p>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setParsed(null)}>Edit</Button>
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

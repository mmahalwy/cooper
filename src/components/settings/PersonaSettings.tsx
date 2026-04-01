'use client';

import { useEffect, useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getPersonaAction, updatePersonaAction } from '@/app/actions';
import { SparklesIcon, CheckIcon, UserCircleIcon } from 'lucide-react';

const TONE_OPTIONS = [
  { id: 'professional', label: 'Professional', desc: 'Clear, polished, business-appropriate' },
  { id: 'casual', label: 'Casual', desc: 'Friendly, relaxed, conversational' },
  { id: 'concise', label: 'Concise', desc: 'Brief, to-the-point, minimal fluff' },
  { id: 'detailed', label: 'Detailed', desc: 'Thorough, comprehensive, explanatory' },
];

export function PersonaSettings() {
  const [name, setName] = useState('Cooper');
  const [instructions, setInstructions] = useState('');
  const [tone, setTone] = useState('professional');
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const data = await getPersonaAction();
      setName(data.persona_name || 'Cooper');
      setInstructions(data.persona_instructions || '');
      setTone(data.persona_tone || 'professional');
    });
  }, []);

  async function handleSave() {
    startTransition(async () => {
      await updatePersonaAction({
        persona_name: name,
        persona_instructions: instructions,
        persona_tone: tone,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Agent Persona</h1>
        <p className="text-sm text-muted-foreground">Customize how Cooper communicates with your team</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-2xl">
        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <UserCircleIcon className="size-4" />
              Identity
            </h3>
            <div>
              <label className="text-xs text-muted-foreground">Agent Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cooper"
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                The name your AI teammate goes by
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <SparklesIcon className="size-4" />
              Communication Style
            </h3>

            <div>
              <label className="text-xs text-muted-foreground">Tone</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {TONE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setTone(opt.id)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      tone === opt.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Custom Instructions</label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g., Always include data sources when presenting numbers. Use bullet points for lists. Address the team informally."
                rows={4}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Additional rules for how Cooper should communicate. These apply to all conversations.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          {saved && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckIcon className="size-3" /> Saved
            </span>
          )}
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Persona'}
          </Button>
        </div>
      </div>
    </div>
  );
}

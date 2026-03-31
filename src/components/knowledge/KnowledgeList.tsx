'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { AddKnowledgeModal } from './AddKnowledgeModal';
import { addKnowledgeAction, deleteKnowledgeAction } from '@/app/actions';
import type { KnowledgeFact } from '@/modules/memory/knowledge';

interface KnowledgeListProps {
  initialFacts: KnowledgeFact[];
}

export function KnowledgeList({ initialFacts }: KnowledgeListProps) {
  const [facts, setFacts] = useState(initialFacts);
  const [modalOpened, setModalOpened] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleAdd = async (content: string) => {
    const result = await addKnowledgeAction(content);
    if (result.fact) {
      setFacts((prev) => [result.fact!, ...prev]);
    }
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteKnowledgeAction(id);
      if (result.success) {
        setFacts((prev) => prev.filter((f) => f.id !== id));
      }
    });
  };

  return (
    <>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Knowledge</h2>
            <p className="text-sm text-muted-foreground">
              Facts Cooper knows about your organization. These are used as context in every conversation.
            </p>
          </div>
          <Button onClick={() => setModalOpened(true)}>
            <PlusIcon data-icon="inline-start" />
            Add knowledge
          </Button>
        </div>

        {facts.length === 0 && (
          <p className="text-center text-muted-foreground mt-8">
            No knowledge yet. Add facts about your organization to make Cooper smarter.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {facts.map((fact) => (
            <Card key={fact.id}>
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="flex-1">
                  <p className="text-sm">{fact.content}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{fact.source}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(fact.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="size-8 text-destructive shrink-0"
                  disabled={pending}
                  onClick={() => handleDelete(fact.id)}>
                  <TrashIcon />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <AddKnowledgeModal opened={modalOpened} onClose={() => setModalOpened(false)} onAdd={handleAdd} />
    </>
  );
}

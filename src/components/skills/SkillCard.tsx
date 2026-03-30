'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrashIcon, ZapIcon } from 'lucide-react';
import type { Skill } from '@/lib/types';

interface SkillCardProps {
  skill: Skill;
  onDelete: (id: string) => void;
}

export function SkillCard({ skill, onDelete }: SkillCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <ZapIcon className="size-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium text-sm">{skill.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{skill.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-xs">v{skill.version}</Badge>
                <Badge variant="secondary" className="text-xs">{skill.created_by}</Badge>
                {skill.tools.map((t) => (
                  <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                ))}
              </div>
              {skill.steps.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {skill.steps.length} step{skill.steps.length !== 1 ? 's' : ''}:
                  {' '}{skill.steps.map((s) => s.action).join(' → ')}
                </div>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="size-8 text-destructive shrink-0"
            onClick={() => onDelete(skill.id)}>
            <TrashIcon />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

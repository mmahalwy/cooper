export interface Skill {
  id: string;
  org_id: string;
  name: string;
  description: string;
  trigger: string;
  steps: SkillStep[];
  tools: string[];
  output_format: string | null;
  created_by: 'user' | 'cooper';
  version: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SkillStep {
  action: string;
  toolName?: string;
  params?: Record<string, unknown>;
  condition?: string;
}

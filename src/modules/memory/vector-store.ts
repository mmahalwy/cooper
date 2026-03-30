import { SupabaseClient } from '@supabase/supabase-js';
import type { VectorStore, VectorEntry, VectorResult, SearchOpts } from './types';

export class SupabaseVectorStore implements VectorStore {
  constructor(private supabase: SupabaseClient) {}

  async upsert(entries: VectorEntry[]): Promise<void> {
    for (const entry of entries) {
      const table = this.getTable(entry.metadata.type as string);
      if (!table) continue;

      const { error } = await this.supabase
        .from(table)
        .upsert({
          id: entry.id,
          org_id: entry.metadata.orgId,
          content: entry.content,
          embedding: entry.embedding,
          source: entry.metadata.source || 'user',
          ...(table === 'skills' ? {
            name: entry.metadata.name,
            description: entry.metadata.description,
            trigger: entry.metadata.trigger,
            steps: entry.metadata.steps,
            tools: entry.metadata.tools,
            output_format: entry.metadata.outputFormat,
            created_by: entry.metadata.createdBy,
          } : {}),
        });

      if (error) {
        console.error(`[vector-store] Failed to upsert to ${table}:`, error);
      }
    }
  }

  async search(query: number[], opts: SearchOpts): Promise<VectorResult[]> {
    const type = opts.filter?.type as string;
    const orgId = opts.filter?.orgId as string;

    if (!type || !orgId) return [];

    const rpcName = type === 'knowledge' ? 'match_knowledge' : 'match_skills';

    const { data, error } = await this.supabase.rpc(rpcName, {
      query_embedding: query,
      match_org_id: orgId,
      match_count: opts.topK,
      match_threshold: opts.minScore || 0.6,
    });

    if (error) {
      console.error(`[vector-store] Search failed:`, error);
      return [];
    }

    return (data || []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      content: (row.content || row.description || '') as string,
      similarity: row.similarity as number,
      metadata: row,
    }));
  }

  async delete(ids: string[]): Promise<void> {
    await this.supabase.from('knowledge').delete().in('id', ids);
    await this.supabase.from('skills').delete().in('id', ids);
  }

  private getTable(type: string): string | null {
    switch (type) {
      case 'knowledge': return 'knowledge';
      case 'skill': return 'skills';
      default: return null;
    }
  }
}

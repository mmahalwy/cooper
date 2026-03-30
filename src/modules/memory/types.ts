export interface VectorEntry {
  id: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  content: string;
}

export interface VectorResult {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface SearchOpts {
  topK: number;
  filter?: Record<string, unknown>;
  minScore?: number;
}

export interface VectorStore {
  upsert(entries: VectorEntry[]): Promise<void>;
  search(query: number[], opts: SearchOpts): Promise<VectorResult[]>;
  delete(ids: string[]): Promise<void>;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

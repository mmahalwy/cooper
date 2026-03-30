import { embed, embedMany } from 'ai';
import { google } from '@ai-sdk/google';
import type { EmbeddingProvider } from './types';

class GoogleEmbeddingProvider implements EmbeddingProvider {
  private model = google.embeddingModel('text-embedding-004');

  async embed(text: string): Promise<number[]> {
    const result = await embed({
      model: this.model,
      value: text,
    });
    return result.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const result = await embedMany({
      model: this.model,
      values: texts,
    });
    return result.embeddings;
  }
}

export const embeddingProvider: EmbeddingProvider = new GoogleEmbeddingProvider();

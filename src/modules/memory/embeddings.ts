import { embed, embedMany } from 'ai';
import { google } from '@ai-sdk/google';
import type { EmbeddingProvider } from './types';

class GoogleEmbeddingProvider implements EmbeddingProvider {
  private model = google.embeddingModel('gemini-embedding-001');

  async embed(text: string): Promise<number[]> {
    if (!text || !text.trim()) {
      return new Array(768).fill(0);
    }
    const result = await embed({
      model: this.model,
      value: text,
      providerOptions: {
        google: { outputDimensionality: 768 },
      },
    });
    return result.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const result = await embedMany({
      model: this.model,
      values: texts,
      providerOptions: {
        google: { outputDimensionality: 768 },
      },
    });
    return result.embeddings;
  }
}

export const embeddingProvider: EmbeddingProvider = new GoogleEmbeddingProvider();

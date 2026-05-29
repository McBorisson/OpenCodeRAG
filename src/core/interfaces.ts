export interface Chunk {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    filePath: string;
    startLine: number;
    endLine: number;
    language: string;
  };
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
}

export interface Chunker {
  readonly language: string;
  readonly fileExtensions?: string[];
  chunk(filePath: string, content: string): Promise<Chunk[]>;
}

export interface EmbeddingProvider {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
}

export interface VectorStore {
  addChunks(chunks: Chunk[]): Promise<void>;
  search(embedding: number[], topK: number): Promise<SearchResult[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
  deleteByFilePath(filePath: string): Promise<void>;
}

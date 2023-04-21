export interface VectorDb {
  createIndex: (name: string, dimension: number) => Promise<void>;
  indexVectors: (
    indexName: string,
    points: {
      id: string;
      payload: unknown;
      vector: number[];
    }[],
  ) => Promise<void>;
}

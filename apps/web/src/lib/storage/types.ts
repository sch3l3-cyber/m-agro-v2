/**
 * StorageClient (01_ARHITEKTURA_v2.md). Implementacija (R2 binding u Workeru) dolazi
 * u Fazi 2 zajedno s NDVI cacheom — do tada nema potrošača pa ni implementacije
 * (07: "ne praviti možda-će-trebati apstrakcije").
 */
export interface StorageMeta {
  contentType?: string;
  cacheControl?: string;
}

export interface StorageObject {
  key: string;
  size: number;
  uploaded: Date;
  body?: ReadableStream<Uint8Array>;
}

export interface StorageClient {
  put(key: string, data: ArrayBuffer | ReadableStream<Uint8Array>, meta?: StorageMeta): Promise<void>;
  get(key: string): Promise<StorageObject | null>;
  delete(key: string): Promise<void>;
  list(prefix: string, limit?: number): Promise<StorageObject[]>;
}

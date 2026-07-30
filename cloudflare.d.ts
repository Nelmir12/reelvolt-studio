declare module "cloudflare:workers" {
  export const env: unknown;
}

type Fetcher = {
  fetch(request: Request): Promise<Response>;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ meta: { changes?: number } }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
};

type R2ObjectBody = {
  body: ReadableStream;
  size: number;
};

type R2Bucket = {
  put(key: string, value: ReadableStream | ArrayBuffer | string | null, options?: unknown): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
};

type ScheduledController = {
  scheduledTime: number;
  cron: string;
  noRetry(): void;
};

import type { Kysely } from "kysely";

// Database executor that works with any Kysely database
export type DatabaseExecutor<T = any> = Kysely<T>;

export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  warn?: (obj: unknown, msg?: string) => void;
  debug?: (obj: unknown, msg?: string) => void;
};

export type Dependencies<T = any> = {
  db: DatabaseExecutor<T>;
  logger: Logger;
};

export type ExtendedOptions = {
  partition?: string;
  streamType?: string;
};

export const PostgreSQLEventStoreDefaultStreamVersion = 0n;
export const DEFAULT_PARTITION = "default_partition" as const;

// Projection types
export type ProjectionEventMetadata = {
  streamId: string;
  streamPosition: bigint;
  globalPosition: bigint;
};

export type ProjectionEvent = {
  type: string;
  data: unknown;
  metadata: ProjectionEventMetadata;
};

export type ProjectionContext<T = DatabaseExecutor<any>> = {
  db: T;
  partition: string;
};

export type ProjectionHandler<T = DatabaseExecutor<any>> = (
  ctx: ProjectionContext<T>,
  event: ProjectionEvent,
) => void | Promise<void>;

export type ProjectionRegistry<T = DatabaseExecutor<any>> = Record<
  string,
  ProjectionHandler<T>[]
>;

export function createProjectionRegistry<T = DatabaseExecutor<any>>(
  ...registries: ProjectionRegistry<T>[]
): ProjectionRegistry<T> {
  const combined: ProjectionRegistry<T> = {};
  /**
   * This is necessary because the projection runner can be used to project events from multiple partitions.
   * e.g., the generators-read-model projection runner can be used to project events for partition A, partition B, and partition C.
   */
  for (const reg of registries) {
    for (const [eventType, handlers] of Object.entries(reg)) {
      combined[eventType] = [...(combined[eventType] ?? []), ...handlers];
    }
  }
  return combined;
}

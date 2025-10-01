import type { Kysely, Transaction } from "kysely";
import type { DB as DBSchema } from "kysely-codegen";

export type DatabaseExecutor = Kysely<DBSchema> | Transaction<DBSchema>;

export type ProjectionContext = {
  db: DatabaseExecutor;
  partition: string;
};

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

export type ProjectionHandler = (
  ctx: ProjectionContext,
  event: ProjectionEvent,
) => Promise<void>;

export type ProjectionRegistry = Record<string, ProjectionHandler[]>;

export function createProjectionRegistry(
  ...registries: ProjectionRegistry[]
): ProjectionRegistry {
  const combined: ProjectionRegistry = {};
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

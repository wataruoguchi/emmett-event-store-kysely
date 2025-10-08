import { createKyselyEventStoreConsumer } from "@wataruoguchi/emmett-event-store-kysely";
import type {
  ProjectionContext,
  ProjectionEvent,
  ProjectionRegistry,
} from "@wataruoguchi/emmett-event-store-kysely/projections";
import type { DatabaseExecutor } from "../../../shared/infra/db.js";
import type { Logger } from "../../../shared/infra/logger.js";
import type {
  GeneratorCreatedData,
  GeneratorUpdatedData,
} from "./generator.event-handler.js";

async function upsertIfNewer(
  db: DatabaseExecutor,
  event: ProjectionEvent,
  apply: (db: DatabaseExecutor) => Promise<void>,
) {
  const existing = await db
    .selectFrom("generators")
    .select(["last_stream_position"])
    .where("stream_id", "=", event.metadata.streamId)
    .executeTakeFirst();

  const lastPos = existing
    ? BigInt(String(existing.last_stream_position))
    : -1n;
  if (event.metadata.streamPosition <= lastPos) return;

  await apply(db);
}

/**
 * Projection registry that defines how generator events are transformed into read model updates.
 *
 * This is the **definition** of projection logic - a mapping of event types to handler functions.
 *
 * **When to use this:**
 * - In tests where you need on-demand, synchronous projection using `createProjectionRunner`
 * - For batch processing or manual projection triggers
 * - When you need fine-grained control over when events are projected
 *
 * **When NOT to use this:**
 * - For continuous background processing in production - use `createGeneratorsConsumer()` instead
 *
 * @returns ProjectionRegistry mapping event types to handlers
 *
 * @example
 * ```typescript
 * // In tests: on-demand projection
 * const registry = generatorsProjection();
 * const runner = createProjectionRunner({ db, readStream, registry });
 * await runner.projectEvents('subscription-id', 'stream-id', { partition: 'tenant-123' });
 * ```
 */
export function generatorsProjection(): ProjectionRegistry<DatabaseExecutor> {
  return {
    GeneratorCreated: [
      async (
        { db, partition }: ProjectionContext<DatabaseExecutor>,
        event: ProjectionEvent,
      ) => {
        const data = event.data as GeneratorCreatedData;
        await upsertIfNewer(db, event, async (q) => {
          await q
            .insertInto("generators")
            .values({
              tenant_id: data.eventMeta.tenantId,
              generator_id: data.eventMeta.generatorId,
              name: data.eventData.name ?? "",
              address: data.eventData.address ?? "",
              generator_type: data.eventData.generatorType ?? "other",
              notes: data.eventData.notes ?? null,
              is_deleted: false,
              stream_id: event.metadata.streamId,
              last_stream_position: event.metadata.streamPosition.toString(),
              last_global_position: event.metadata.globalPosition.toString(),
              partition,
            })
            .onConflict((oc) =>
              /**
               * You may want to learn about upserts in PostgreSQL. "excluded" is a special keyword in PostgreSQL.
               * https://neon.com/postgresql/postgresql-tutorial/postgresql-upsert#introduction-to-the-postgresql-upsert-statement
               */
              oc
                .columns(["tenant_id", "generator_id", "partition"])
                .doUpdateSet({
                  name: (eb) => eb.ref("excluded.name"),
                  address: (eb) => eb.ref("excluded.address"),
                  generator_type: (eb) => eb.ref("excluded.generator_type"),
                  notes: (eb) => eb.ref("excluded.notes"),
                  is_deleted: (eb) => eb.ref("excluded.is_deleted"),
                  last_stream_position: (eb) =>
                    eb.ref("excluded.last_stream_position"),
                  last_global_position: (eb) =>
                    eb.ref("excluded.last_global_position"),
                }),
            )
            .execute();
        });
      },
    ],
    GeneratorUpdated: [
      async (
        { db, partition }: ProjectionContext<DatabaseExecutor>,
        event: ProjectionEvent,
      ) => {
        const data = event.data as GeneratorUpdatedData;
        await upsertIfNewer(db, event, async (q) => {
          await q
            .updateTable("generators")
            .set({
              name: data.eventData.name ?? undefined,
              address: data.eventData.address ?? undefined,
              generator_type: data.eventData.generatorType ?? undefined,
              notes: data.eventData.notes ?? undefined,
              last_stream_position: event.metadata.streamPosition.toString(),
              last_global_position: event.metadata.globalPosition.toString(),
            })
            .where("stream_id", "=", event.metadata.streamId)
            .where("partition", "=", partition)
            .execute();
        });
      },
    ],
    GeneratorDeleted: [
      async (
        { db, partition }: ProjectionContext<DatabaseExecutor>,
        event: ProjectionEvent,
      ) => {
        await upsertIfNewer(db, event, async (q) => {
          await q
            .updateTable("generators")
            .set({
              is_deleted: true,
              last_stream_position: event.metadata.streamPosition.toString(),
              last_global_position: event.metadata.globalPosition.toString(),
            })
            .where("stream_id", "=", event.metadata.streamId)
            .where("partition", "=", partition)
            .execute();
        });
      },
    ],
  } satisfies ProjectionRegistry;
}

/**
 * Creates a consumer that automatically processes generator events and updates the read model.
 *
 * This is the **execution mechanism** - a running consumer that continuously polls for new events
 * and applies the projection handlers defined in `generatorsProjection()`.
 *
 * **When to use this:**
 * - In production for continuous, automatic read model updates
 * - When you want background processing with automatic checkpointing
 * - For real-time or near-real-time read model consistency
 *
 * **When NOT to use this:**
 * - In tests where you need synchronous, on-demand projection - use `generatorsProjection()` with `createProjectionRunner` instead
 * - When you need fine-grained control over projection timing
 *
 * **Key Features:**
 * - Polls for new events at configurable intervals
 * - Tracks its position automatically (won't reprocess events)
 * - Processes events in batches for efficiency
 * - Supports graceful start/stop
 *
 * @param db - Database executor instance
 * @param logger - Logger instance
 * @param partition - Partition to process (typically tenant ID)
 * @param consumerName - Optional custom consumer name for tracking
 * @param batchSize - Optional batch size for processing events (default: 100)
 * @param pollingInterval - Optional polling interval in milliseconds (default: 1000)
 * @returns Consumer instance with start/stop methods
 *
 * @example
 * ```typescript
 * // In production: continuous background processing
 * const consumer = createGeneratorsConsumer({
 *   db,
 *   logger,
 *   partition: 'tenant-123',
 *   consumerName: 'generators-tenant-123',
 *   batchSize: 50,
 *   pollingInterval: 500
 * });
 *
 * // Start processing events
 * await consumer.start();
 *
 * // Later, when shutting down
 * await consumer.stop();
 * ```
 */
export function createGeneratorsConsumer({
  db,
  logger,
  partition,
  consumerName = "generators-read-model",
  batchSize = 100,
  pollingInterval = 1000,
}: {
  db: DatabaseExecutor;
  logger: Logger;
  partition: string;
  consumerName?: string;
  batchSize?: number;
  pollingInterval?: number;
}) {
  const consumer = createKyselyEventStoreConsumer({
    db,
    logger,
    consumerName,
    batchSize,
    pollingInterval,
  });

  // Subscribe to all generator events with the projection handlers
  const registry = generatorsProjection();

  for (const [eventType, handlers] of Object.entries(registry)) {
    for (const handler of handlers) {
      consumer.subscribe(async (event) => {
        // Convert consumer event to projection event format
        const projectionEvent: ProjectionEvent = {
          type: event.type,
          data: event.data,
          metadata: {
            streamId: event.metadata.streamName,
            streamPosition: event.metadata.streamPosition,
            globalPosition: event.metadata.globalPosition,
          },
        };

        await handler({ db, partition }, projectionEvent);
      }, eventType);
    }
  }

  return consumer;
}

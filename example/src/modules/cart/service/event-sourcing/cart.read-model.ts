import type {
  Event,
  ReadEvent,
  ReadEventMetadataWithGlobalPosition,
} from "@event-driven-io/emmett";
import { createKyselyEventStoreConsumer } from "@wataruoguchi/emmett-event-store-kysely";
import type {
  ProjectionContext,
  ProjectionEvent,
  ProjectionHandler,
  ProjectionRegistry,
} from "@wataruoguchi/emmett-event-store-kysely/projections";
import type { DatabaseExecutor } from "../../../shared/infra/db.js";
import type { Logger } from "../../../shared/infra/logger.js";
import type {
  CartCreatedData,
  ItemAddedToCartData,
  ItemRemovedFromCartData,
} from "./cart.event-handler.js";

type CartReadItem = {
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

function parseItemsJson(raw: unknown): CartReadItem[] {
  const val = raw;
  if (Array.isArray(val)) return val as CartReadItem[];
  if (val === null || val === undefined) return [] as CartReadItem[];
  if (typeof val === "string") {
    const s = val.trim();
    if (s.length === 0) return [] as CartReadItem[];
    try {
      return JSON.parse(s) as CartReadItem[];
    } catch {
      return [] as CartReadItem[];
    }
  }
  return [] as CartReadItem[];
}

async function upsertIfNewer(
  db: DatabaseExecutor,
  event: ProjectionEvent,
  apply: (db: DatabaseExecutor) => Promise<void>,
) {
  const existing = await db
    .selectFrom("carts")
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
 * Projection registry that defines how cart events are transformed into read model updates.
 *
 * This is the **definition** of projection logic - a mapping of event types to handler functions.
 *
 * **When to use this:**
 * - In tests where you need on-demand, synchronous projection using `createProjectionRunner`
 * - For batch processing or manual projection triggers
 * - When you need fine-grained control over when events are projected
 *
 * **When NOT to use this:**
 * - For continuous background processing in production - use `createCartsConsumer()` instead
 *
 * @returns ProjectionRegistry mapping event types to handlers
 *
 * @example
 * ```typescript
 * // In tests: on-demand projection
 * const registry = cartsProjection();
 * const runner = createProjectionRunner({ db, readStream, registry });
 * await runner.projectEvents('subscription-id', 'stream-id', { partition: 'tenant-123' });
 * ```
 */
export function cartsProjection(): ProjectionRegistry<DatabaseExecutor> {
  return {
    CartCreated: [
      async (
        { db, partition }: ProjectionContext<DatabaseExecutor>,
        event: ProjectionEvent,
      ) => {
        const data = event.data as CartCreatedData;
        await upsertIfNewer(db, event, async (q) => {
          await q
            .insertInto("carts")
            .values({
              tenant_id: data.eventMeta.tenantId,
              cart_id: data.eventMeta.cartId,
              currency: data.eventData.currency ?? "USD",
              is_checked_out: false,
              is_cancelled: false,
              items_json: JSON.stringify([]),
              stream_id: event.metadata.streamId,
              last_stream_position: event.metadata.streamPosition.toString(),
              last_global_position: event.metadata.globalPosition.toString(),
              partition,
            })
            .onConflict((oc) =>
              oc.columns(["tenant_id", "cart_id", "partition"]).doUpdateSet({
                currency: (eb) => eb.ref("excluded.currency"),
                is_checked_out: (eb) => eb.ref("excluded.is_checked_out"),
                is_cancelled: (eb) => eb.ref("excluded.is_cancelled"),
                items_json: (eb) => eb.ref("excluded.items_json"),
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
    ItemAddedToCart: [
      async (
        { db, partition }: ProjectionContext<DatabaseExecutor>,
        event: ProjectionEvent,
      ) => {
        const data = event.data as ItemAddedToCartData;
        await upsertIfNewer(db, event, async (q) => {
          const row = await q
            .selectFrom("carts")
            .select(["items_json"])
            .where("stream_id", "=", event.metadata.streamId)
            .where("partition", "=", partition)
            .executeTakeFirst();
          const items: CartReadItem[] = parseItemsJson(row?.items_json);
          const existing = items.find(
            (i) => i.sku === data.eventData.item?.sku,
          );
          if (existing) existing.quantity += data.eventData.item?.quantity ?? 0;
          else if (data.eventData.item) items.push(data.eventData.item);

          await q
            .updateTable("carts")
            .set({
              items_json: JSON.stringify(items),
              last_stream_position: event.metadata.streamPosition.toString(),
              last_global_position: event.metadata.globalPosition.toString(),
            })
            .where("stream_id", "=", event.metadata.streamId)
            .where("partition", "=", partition)
            .execute();
        });
      },
    ],
    ItemRemovedFromCart: [
      async (
        { db, partition }: ProjectionContext<DatabaseExecutor>,
        event: ProjectionEvent,
      ) => {
        const data = event.data as ItemRemovedFromCartData;
        await upsertIfNewer(db, event, async (q) => {
          const row = await q
            .selectFrom("carts")
            .select(["items_json"])
            .where("stream_id", "=", event.metadata.streamId)
            .where("partition", "=", partition)
            .executeTakeFirst();
          let items: CartReadItem[] = parseItemsJson(row?.items_json);
          items = items
            .map((i) =>
              i.sku === data.eventData.sku
                ? {
                    ...i,
                    quantity: i.quantity - (data.eventData.quantity ?? 0),
                  }
                : i,
            )
            .filter((i) => i.quantity > 0);

          await q
            .updateTable("carts")
            .set({
              items_json: JSON.stringify(items),
              last_stream_position: event.metadata.streamPosition.toString(),
              last_global_position: event.metadata.globalPosition.toString(),
            })
            .where("stream_id", "=", event.metadata.streamId)
            .where("partition", "=", partition)
            .execute();
        });
      },
    ],
    CartEmptied: [
      async (
        { db, partition }: ProjectionContext<DatabaseExecutor>,
        event: ProjectionEvent,
      ) => {
        await upsertIfNewer(db, event, async (q) => {
          await q
            .updateTable("carts")
            .set({
              items_json: JSON.stringify([]),
              last_stream_position: event.metadata.streamPosition.toString(),
              last_global_position: event.metadata.globalPosition.toString(),
            })
            .where("stream_id", "=", event.metadata.streamId)
            .where("partition", "=", partition)
            .execute();
        });
      },
    ],
    CartCheckedOut: [
      async (
        { db, partition }: ProjectionContext<DatabaseExecutor>,
        event: ProjectionEvent,
      ) => {
        await upsertIfNewer(db, event, async (q) => {
          // Just mark as checked out - items_json should already have the correct items
          // from previous ItemAdded/ItemRemoved projections
          await q
            .updateTable("carts")
            .set({
              is_checked_out: true,
              last_stream_position: event.metadata.streamPosition.toString(),
              last_global_position: event.metadata.globalPosition.toString(),
            })
            .where("stream_id", "=", event.metadata.streamId)
            .where("partition", "=", partition)
            .execute();
        });
      },
    ],
    CartCancelled: [
      async (
        { db, partition }: ProjectionContext<DatabaseExecutor>,
        event: ProjectionEvent,
      ) => {
        await upsertIfNewer(db, event, async (q) => {
          await q
            .updateTable("carts")
            .set({
              is_cancelled: true,
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
 * Creates a consumer that automatically processes cart events and updates the read model.
 *
 * This is the **execution mechanism** - a running consumer that continuously polls for new events
 * and applies the projection handlers defined in `cartsProjection()`.
 *
 * **When to use this:**
 * - In production for continuous, automatic read model updates
 * - When you want background processing with automatic checkpointing
 * - For real-time or near-real-time read model consistency
 *
 * **When NOT to use this:**
 * - In tests where you need synchronous, on-demand projection - use `cartsProjection()` with `createProjectionRunner` instead
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
 * const consumer = createCartsConsumer({
 *   db,
 *   logger,
 *   partition: 'tenant-123',
 *   consumerName: 'carts-tenant-123',
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
export function createCartsConsumer({
  db,
  logger,
  partition,
  consumerName = "carts-read-model",
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

  // Subscribe to all cart events with the projection handlers
  const registry: ProjectionRegistry<DatabaseExecutor> = cartsProjection();

  for (const [eventType, handlers] of Object.entries(registry)) {
    for (const handler of handlers as ProjectionHandler<DatabaseExecutor>[]) {
      consumer.subscribe(
        async (
          event: ReadEvent<
            Event<string, any, undefined>,
            ReadEventMetadataWithGlobalPosition
          >,
        ) => {
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
        },
        eventType,
      );
    }
  }

  return consumer;
}

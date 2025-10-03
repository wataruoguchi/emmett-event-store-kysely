import type {
  ProjectionEvent,
  ProjectionRegistry,
} from "@wataruoguchi/event-sourcing/projections";
import type { DatabaseExecutor } from "../../../shared/infra/db.js";

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

type CartEventData = {
  tenantId: string;
  cartId: string;
  currency?: string;
  item?: { sku: string; name: string; unitPrice: number; quantity: number };
  sku?: string;
  quantity?: number;
  orderId?: string;
  total?: number;
  reason?: string;
};

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

export function cartsProjection(): ProjectionRegistry<DatabaseExecutor> {
  return {
    CartCreated: [
      async ({ db, partition }, event) => {
        const data = event.data as CartEventData;
        await upsertIfNewer(db, event, async (q) => {
          await q
            .insertInto("carts")
            .values({
              tenant_id: data.tenantId,
              cart_id: data.cartId,
              currency: data.currency ?? "USD",
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
      async ({ db, partition }, event) => {
        const data = event.data as CartEventData;
        await upsertIfNewer(db, event, async (q) => {
          const row = await q
            .selectFrom("carts")
            .select(["items_json"])
            .where("stream_id", "=", event.metadata.streamId)
            .where("partition", "=", partition)
            .executeTakeFirst();
          const items: CartReadItem[] = parseItemsJson(row?.items_json);
          const existing = items.find((i) => i.sku === data.item?.sku);
          if (existing) existing.quantity += data.item?.quantity ?? 0;
          else if (data.item) items.push(data.item);

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
      async ({ db, partition }, event) => {
        const data = event.data as CartEventData;
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
              i.sku === data.sku
                ? { ...i, quantity: i.quantity - (data.quantity ?? 0) }
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
      async ({ db, partition }, event) => {
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
      async ({ db, partition }, event) => {
        await upsertIfNewer(db, event, async (q) => {
          const row = await q
            .selectFrom("carts")
            .select(["items_json"])
            .where("stream_id", "=", event.metadata.streamId)
            .where("partition", "=", partition)
            .executeTakeFirst();

          const items: CartReadItem[] = parseItemsJson(row?.items_json);

          const { orderId, total } =
            (event.data as { orderId?: string; total?: number }) ?? {};

          await q
            .updateTable("carts")
            .set({
              is_checked_out: true,
              items_json: JSON.stringify({ items, orderId, total }),
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
      async ({ db, partition }, event) => {
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

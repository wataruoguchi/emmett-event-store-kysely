import type {
  DatabaseExecutor,
  ProjectionEvent,
  ProjectionRegistry,
} from "../../../shared/event-sourcing/projections/types.js";

type GeneratorEventData = {
  tenantId: string;
  generatorId: string;
  name?: string;
  address?: string;
  generatorType?: string;
  notes?: string | null;
};

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

export function generatorsProjection(): ProjectionRegistry {
  return {
    GeneratorCreated: [
      async ({ db, partition }, event) => {
        const data = event.data as GeneratorEventData;
        await upsertIfNewer(db, event, async (q) => {
          await q
            .insertInto("generators")
            .values({
              tenant_id: data.tenantId,
              generator_id: data.generatorId,
              name: data.name ?? "",
              address: data.address ?? "",
              generator_type: data.generatorType ?? "other",
              notes: data.notes ?? null,
              is_deleted: false,
              stream_id: event.metadata.streamId,
              last_stream_position: event.metadata.streamPosition.toString(),
              last_global_position: event.metadata.globalPosition.toString(),
              partition,
            })
            .onConflict((oc) =>
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
      async ({ db, partition }, event) => {
        const data = event.data as GeneratorEventData;
        await upsertIfNewer(db, event, async (q) => {
          await q
            .updateTable("generators")
            .set({
              name: data.name ?? undefined,
              address: data.address ?? undefined,
              generator_type: data.generatorType ?? undefined,
              notes: data.notes ?? undefined,
              last_stream_position: event.metadata.streamPosition.toString(),
              last_global_position: event.metadata.globalPosition.toString(),
            })
            .where("tenant_id", "=", data.tenantId)
            .where("generator_id", "=", data.generatorId)
            .where("partition", "=", partition)
            .execute();
        });
      },
    ],
    GeneratorDeleted: [
      async ({ db, partition }, event) => {
        const data = event.data as Pick<GeneratorEventData, "tenantId"> & {
          generatorId: string;
        };
        await upsertIfNewer(db, event, async (q) => {
          await q
            .updateTable("generators")
            .set({
              is_deleted: true,
              last_stream_position: event.metadata.streamPosition.toString(),
              last_global_position: event.metadata.globalPosition.toString(),
            })
            .where("tenant_id", "=", data.tenantId)
            .where("generator_id", "=", data.generatorId)
            .where("partition", "=", partition)
            .execute();
        });
      },
    ],
  } satisfies ProjectionRegistry;
}

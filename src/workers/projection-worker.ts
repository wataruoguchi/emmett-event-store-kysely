import { generatorsProjection } from "../modules/generator/service/event-sourcing/generator.read-model.js";
import { createEventStore } from "../modules/shared/event-sourcing/event-store.js";
import { createProjectionRunner } from "../modules/shared/event-sourcing/projections/runner.js";
import { createProjectionRegistry } from "../modules/shared/event-sourcing/projections/types.js";
import { getDb } from "../modules/shared/infra/db.js";

async function main() {
  const db = getDb();
  const { readStream } = createEventStore({ db });
  const registry = createProjectionRegistry(generatorsProjection());
  const runner = createProjectionRunner({ db, readStream, registry });

  const subscriptionId = "generators-read-model";
  const partition = "default_partition"; // Partition for readStream
  const batchSize = 200;
  const pollIntervalMs = Number(process.env.PROJECTION_POLL_MS ?? 1000);

  while (true) {
    // Scan a small set of streams for the generator domain; you can broaden this later.
    const streams = await db
      .selectFrom("streams")
      .select(["stream_id"])
      .where("is_archived", "=", false)
      .limit(50)
      .execute();

    for (const s of streams) {
      const streamId = s.stream_id as string;
      await runner.projectEvents(subscriptionId, streamId, {
        partition,
        batchSize,
      });
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

main().catch((err) => {
  console.error("projection-worker error", err);
  process.exit(1);
});

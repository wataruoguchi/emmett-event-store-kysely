#!/usr/bin/env node

import type { SelectQueryBuilder } from "kysely";
import type { DB as DBSchema } from "kysely-codegen";
import { generatorsProjection } from "../modules/generator/service/event-sourcing/generator.read-model.js";
import { createEventStore } from "../modules/shared/event-sourcing/event-store.js";
import { createProjectionRunner } from "../modules/shared/event-sourcing/projections/runner.js";
import { createProjectionRegistry } from "../modules/shared/event-sourcing/projections/types.js";
import { getDb } from "../modules/shared/infra/db.js";
import { logger } from "../modules/shared/infra/logger.js";

// TODO: Take the partition as an argument.
const partition = process.argv[2];
if (!partition) {
  throw new Error("Partition is required");
}

main(partition).catch((err) => {
  logger.error({ err }, "projection-worker error");
  process.exit(1);
});

/**
 * Code example for the projection worker.
 * It can be used to project events from multiple partitions.
 * e.g., the generators-read-model projection runner can be used to project events for partition A, partition B, and partition C.
 */
async function main(partition: string) {
  const db = getDb();
  const { readStream } = createEventStore({ db, logger });
  const registry = createProjectionRegistry(generatorsProjection());
  const runner = createProjectionRunner({ db, readStream, registry });

  const subscriptionId = "generators-read-model-by-worker";
  const batchSize = 200;
  const pollIntervalMs = Number(process.env.PROJECTION_POLL_MS ?? 1000);
  let lastStreamId: string | null = null; // keyset cursor

  type QueryBuilder = SelectQueryBuilder<
    DBSchema,
    "streams",
    { stream_id: string }
  >;
  const initialQuery: QueryBuilder = db
    .selectFrom("streams")
    .select(["stream_id"])
    .where("is_archived", "=", false)
    .where("partition", "=", partition)
    .orderBy("stream_id");

  while (true) {
    // Scan a small set of streams for the generator domain; you can broaden this later.
    const q: QueryBuilder = lastStreamId
      ? initialQuery
      : initialQuery.where("stream_id", ">", lastStreamId);

    const streams = await q.limit(50).execute();

    for (const s of streams) {
      const streamId = s.stream_id;
      await runner.projectEvents(subscriptionId, streamId, {
        partition,
        batchSize,
      });
    }

    // Advance keyset cursor; wrap around when we reach the end
    if (streams.length > 0) {
      lastStreamId = streams[streams.length - 1].stream_id;
    } else {
      logger.info({ partition }, "No streams found");
      // Exit the loop.
      break;
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

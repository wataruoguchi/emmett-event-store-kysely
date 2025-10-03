import type { DatabaseExecutor } from "../../infra/db.js";
import type { Logger } from "../../infra/logger.js";
import {
  createAggregateStream,
  type AggregateStream,
} from "./aggregate-stream.js";
import {
  createAppendToStream,
  type AppendToStream,
} from "./append-to-stream.js";
import { createReadStream, type ReadStream } from "./read-stream.js";

export type { ReadStream };

export type EventStore = ReturnType<typeof createEventStore>;
/**
 * This function is inspired by the following emmett eventStore functions
 *
 * - src/packages/emmett/src/eventStore/eventStore.ts
 * - src/packages/emmett-postgresql/src/eventStore/postgreSQLEventStore.ts
 * - src/packages/emmett-sqlite/src/eventStore/SQLiteEventStore.ts
 */
type Dependencies = {
  db: DatabaseExecutor;
  logger: Logger;
};
export function createEventStore(dependencies: Dependencies): {
  readStream: ReadStream;
  aggregateStream: AggregateStream;
  appendToStream: AppendToStream;
} {
  const readStream = createReadStream(dependencies);

  /**
   * The returned object is consumed by the handler created by the DeciderCommandHandler function.
   */
  return {
    readStream,
    aggregateStream: createAggregateStream({ readStream }, dependencies),
    appendToStream: createAppendToStream(dependencies),
  };
}

import type { Dependencies } from "../types.js";
import { createAggregateStream } from "./aggregate-stream.js";
import { createAppendToStream } from "./append-to-stream.js";
import { createReadStream } from "./read-stream.js";

export type {
  DatabaseExecutor,
  Dependencies,
  ExtendedOptions,
} from "../types.js";
export type { AggregateStream } from "./aggregate-stream.js";
export type { AppendToStream } from "./append-to-stream.js";
export type { ReadStream } from "./read-stream.js";
export type EventStore = ReturnType<typeof createEventStore>;

export { createReadStream } from "./read-stream.js";
export function createEventStore<T = any>(deps: Dependencies<T>) {
  const readStream = createReadStream(deps as unknown as Dependencies);
  const appendToStream = createAppendToStream(deps as unknown as Dependencies);
  const aggregateStream = createAggregateStream(
    { readStream },
    deps as unknown as Dependencies,
  );
  return { readStream, appendToStream, aggregateStream };
}

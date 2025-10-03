import { createAggregateStream } from "./aggregate-stream.js";
import { createAppendToStream } from "./append-to-stream.js";
import { createReadStream } from "./read-stream.js";
import type { Dependencies } from "./types-consts.js";

export type { AggregateStream } from "./aggregate-stream.js";
export type { AppendToStream } from "./append-to-stream.js";
export type { ReadStream } from "./read-stream.js";
export type { Dependencies, ExtendedOptions } from "./types-consts.js";
export type {
  ProjectionEvent,
  ReadStream as ProjectionReadStream,
  ProjectionRegistry,
} from "./types.js";

export function createEventStore(deps: Dependencies) {
  const readStream = createReadStream(deps);
  const appendToStream = createAppendToStream(deps);
  const aggregateStream = createAggregateStream({ readStream }, deps);
  return { readStream, appendToStream, aggregateStream };
}

import type { Event } from "@event-driven-io/emmett";
import type { DatabaseExecutor } from "./types-consts.js";

export type ProjectionEvent = {
  type: string;
  data: unknown;
  metadata: {
    streamId: string;
    streamPosition: bigint;
    globalPosition: bigint;
  };
};

export type ProjectionHandler = (
  ctx: { db: DatabaseExecutor; partition: string },
  event: ProjectionEvent,
) => Promise<void> | void;

export type ProjectionRegistry = Record<string, ProjectionHandler[]>;

export type ReadStream = <E extends Event>(
  streamId: string,
  options?: { from?: bigint; to?: bigint; partition?: string },
) => Promise<{
  events: Array<
    | (E & {
        metadata: {
          streamId: string;
          streamPosition: bigint;
          globalPosition: bigint;
        };
      })
    | null
  >;
  currentStreamVersion: bigint;
  streamExists: boolean;
}>;

// biome-ignore assist/source/organizeImports: retain import order similar to app code
import {
  assertExpectedVersionMatchesCurrent,
  type AggregateStreamOptions,
  type AggregateStreamResult,
  type Event,
  type ReadEventMetadataWithGlobalPosition,
} from "@event-driven-io/emmett";
import {
  PostgreSQLEventStoreDefaultStreamVersion,
  type Dependencies,
} from "../types.js";
import type { ReadStream } from "./read-stream.js";

type PostgresReadEventMetadata = ReadEventMetadataWithGlobalPosition;

export type AggregateStream = <State, EventType extends Event>(
  streamId: string,
  options: AggregateStreamOptions<State, EventType, PostgresReadEventMetadata>,
) => Promise<AggregateStreamResult<State>>;

export function createAggregateStream(
  { readStream }: { readStream: ReadStream },
  { logger }: Dependencies,
): AggregateStream {
  return async function aggregateStream<State, EventType extends Event>(
    streamId: string,
    options: AggregateStreamOptions<
      State,
      EventType,
      PostgresReadEventMetadata
    >,
  ): Promise<AggregateStreamResult<State>> {
    const { evolve, initialState, read } = options;
    logger.info({ streamId, options }, "aggregateStream");

    const expectedStreamVersion = read?.expectedStreamVersion;

    const result = await readStream<EventType>(streamId, options.read);
    assertExpectedVersionMatchesCurrent(
      result.currentStreamVersion,
      expectedStreamVersion,
      PostgreSQLEventStoreDefaultStreamVersion,
    );

    const state = result.events.reduce(
      (state, event) => (event ? evolve(state, event) : state),
      initialState(),
    );

    return {
      state,
      currentStreamVersion: result.currentStreamVersion,
      streamExists: result.streamExists,
    };
  };
}

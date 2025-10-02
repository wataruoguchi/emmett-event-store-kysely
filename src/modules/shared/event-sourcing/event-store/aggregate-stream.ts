// biome-ignore assist/source/organizeImports: The editor does not behave correctly with this import
import {
  assertExpectedVersionMatchesCurrent,
  type AggregateStreamOptions,
  type AggregateStreamResult,
  type Event,
  type ReadEventMetadataWithGlobalPosition,
} from "@event-driven-io/emmett";
import type { ReadStream } from "./read-stream.js";
import {
  PostgreSQLEventStoreDefaultStreamVersion,
  type Dependencies,
} from "./types-consts.js";

type PostgresReadEventMetadata = ReadEventMetadataWithGlobalPosition;

export type AggregateStream = <State, EventType extends Event>(
  streamId: string,
  options: AggregateStreamOptions<State, EventType, PostgresReadEventMetadata>,
) => Promise<AggregateStreamResult<State>>;

export function createAggregateStream(
  {
    readStream,
  }: {
    readStream: ReadStream;
  },
  { logger }: Dependencies,
): AggregateStream {
  /**
   * This function is pretty much a copy of the emmett aggregateStream function found in `src/packages/emmett-postgresql/src/eventStore/postgreSQLEventStore.ts`
   */
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

    // This is where we fold the events to get the current state.
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

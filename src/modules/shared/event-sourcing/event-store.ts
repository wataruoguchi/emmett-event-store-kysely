// biome-ignore assist/source/organizeImports: The editor does not behave correctly with this import
import {
  assertExpectedVersionMatchesCurrent,
  type AggregateStreamOptions,
  type AggregateStreamResult,
  type AppendToStreamOptions,
  type AppendToStreamResultWithGlobalPosition,
  type Event,
  type ReadEventMetadataWithGlobalPosition,
  type ReadStreamOptions,
  type ReadStreamResult,
} from "@event-driven-io/emmett";
import { getDb, type DB } from "../infra/db.js";

type PostgresReadEventMetadata = ReadEventMetadataWithGlobalPosition;
const PostgreSQLEventStoreDefaultGlobalPosition = 0n;
const PostgreSQLEventStoreDefaultStreamVersion = 0n;

const db = getDb();
export type EventStore = ReturnType<typeof createEventStore>;
export const eventStore: EventStore = createEventStore({
  readStream: createReadStream({ db }),
  appendToStream: createAppendToStream({ db }),
});

type ReadStream = <EventType extends Event>(
  stream: string,
  options?: ReadStreamOptions & { partition?: string },
) => Promise<ReadStreamResult<EventType, PostgresReadEventMetadata>>;

function createReadStream({ db }: { db: DB }): ReadStream {
  return async function readStream(streamName, options) {
    // TODO: Build the query to read the stream
    // https://github.com/event-driven-io/emmett/blob/c1f0d45e6b233ad645f5ad30ebbd1dc41ae033eb/src/packages/emmett-postgresql/src/eventStore/schema/readStream.ts
    /**
     * from
     * to
     * maxCount
     *
     * SELECT stream_id, stream_position, global_position, message_metadata, message_schema_version, message_type, message_id
     * FROM messages
     * ....
     */
    console.log("My readStream", streamName, options);
    return Promise.resolve({
      events: [],
      currentStreamVersion: PostgreSQLEventStoreDefaultStreamVersion,
      streamExists: false,
    });
  };
}

type AppendToStream = <EventType extends Event>(
  stream: string,
  events: EventType[],
  options?: AppendToStreamOptions,
) => Promise<AppendToStreamResultWithGlobalPosition>;

function createAppendToStream({ db }: { db: DB }): AppendToStream {
  return async function appendToStream(streamName, events, options) {
    // https://github.com/event-driven-io/emmett/blob/c1f0d45e6b233ad645f5ad30ebbd1dc41ae033eb/src/packages/emmett-postgresql/src/eventStore/postgreSQLEventStore.ts#L217
    // https://github.com/event-driven-io/emmett/blob/c1f0d45e6b233ad645f5ad30ebbd1dc41ae033eb/src/packages/emmett-postgresql/src/eventStore/schema/appendToStream.ts
    // https://github.com/event-driven-io/emmett/blob/c1f0d45e6b233ad645f5ad30ebbd1dc41ae033eb/src/packages/emmett-sqlite/src/eventStore/schema/appendToStream.ts
    console.log("My appendToStream", streamName, events, options);
    // TODO: Build the streamType
    // TODO: Build the query to append to the stream
    // TODO: Post query to validate the appendResult
    return Promise.resolve({
      lastEventGlobalPosition: PostgreSQLEventStoreDefaultGlobalPosition,
      nextExpectedStreamVersion: PostgreSQLEventStoreDefaultStreamVersion,
      createdNewStream: false,
    });
  };
}

// TODO: This may be "createAggregateStream" or something.
function createEventStore({
  readStream,
  appendToStream,
}: {
  readStream: ReadStream;
  appendToStream: AppendToStream;
}) {
  /**
   * This function is pretty much a copy of the emmett aggregateStream function found in `src/packages/emmett-postgresql/src/eventStore/postgreSQLEventStore.ts`
   */
  async function aggregateStream<State, EventType extends Event>(
    streamName: string,
    options: AggregateStreamOptions<
      State,
      EventType,
      PostgresReadEventMetadata
    >,
  ): Promise<AggregateStreamResult<State>> {
    const { evolve, initialState, read } = options;

    const expectedStreamVersion = read?.expectedStreamVersion;

    const result = await readStream<EventType>(streamName, options.read);
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
  }

  return {
    aggregateStream,
    readStream,
    appendToStream,
  };
}

/**
 * TODO: I don't know how we want to consume the return value of this function.
 */
export function createdNewStream<EventType extends Event>(
  nextStreamPosition: bigint,
  events: EventType[],
) {
  return nextStreamPosition >= BigInt(events.length);
}

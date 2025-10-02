// biome-ignore assist/source/organizeImports: The editor does not behave correctly with this import
import {
  ExpectedVersionConflictError,
  NO_CONCURRENCY_CHECK,
  STREAM_DOES_NOT_EXIST,
  STREAM_EXISTS,
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
import type { DB as DBSchema } from "kysely-codegen";
import { randomUUID } from "node:crypto";
import type { DatabaseExecutor } from "../infra/db.js";
import type { Logger } from "../infra/logger.js";

type PostgresReadEventMetadata = ReadEventMetadataWithGlobalPosition;
const PostgreSQLEventStoreDefaultGlobalPosition = 0n;
const PostgreSQLEventStoreDefaultStreamVersion = 0n;
const DEFAULT_PARTITION = "default_partition";

export type EventStore = ReturnType<typeof createEventStore>;
/**
 * This function is inspired by the following emmett eventStore functions
 *
 * - src/packages/emmett/src/eventStore/eventStore.ts
 * - src/packages/emmett-postgresql/src/eventStore/postgreSQLEventStore.ts
 * - src/packages/emmett-sqlite/src/eventStore/SQLiteEventStore.ts
 */
export function createEventStore({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}): {
  aggregateStream: AggregateStream;
  readStream: ReadStream;
  appendToStream: AppendToStream;
} {
  const readStream = createReadStream({ db, logger });

  /**
   * The returned object is consumed by the handler created by the DeciderCommandHandler function.
   */
  return {
    aggregateStream: createAggregateStream({ readStream }, { logger }),
    readStream,
    appendToStream: createAppendToStream({ db, logger }),
  };
}

// This is how emmett extends the options of the readStream and appendToStream functions.
type ExtendedOptions = {
  partition?: string;
  streamType?: string;
};
type ExtendedAppendToStreamOptions = AppendToStreamOptions & ExtendedOptions;
type ExtendedReadStreamOptions = ReadStreamOptions & ExtendedOptions;

export type ReadStream = <EventType extends Event>(
  stream: string,
  options?: ExtendedReadStreamOptions,
) => Promise<ReadStreamResult<EventType, PostgresReadEventMetadata>>;

function createReadStream({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}): ReadStream {
  return async function readStream<EventType extends Event>(
    streamName: string,
    options?: ExtendedReadStreamOptions,
  ) {
    const partition = options?.partition ?? DEFAULT_PARTITION;
    logger.info({ streamName, options, partition }, "readStream");

    // Determine current stream version and existence from streams table
    const streamRow = await db
      .selectFrom("streams")
      .select(["stream_position"])
      .where("stream_id", "=", streamName)
      .where("partition", "=", partition)
      .where("is_archived", "=", false)
      .executeTakeFirst();

    const streamExists = !!streamRow;
    const currentStreamVersion = streamRow
      ? BigInt(streamRow.stream_position)
      : PostgreSQLEventStoreDefaultStreamVersion;

    // Build events query
    let q = db
      .selectFrom("messages")
      .select([
        "message_type",
        "message_data",
        "message_metadata",
        "stream_position",
        "global_position",
        "message_id",
      ])
      .where("stream_id", "=", streamName)
      .where("partition", "=", partition)
      .where("is_archived", "=", false)
      .orderBy("stream_position");

    const from: bigint | undefined =
      options && typeof options === "object" && "from" in options
        ? options.from
        : undefined;
    const to: bigint | undefined =
      options && typeof options === "object" && "to" in options
        ? options.to
        : undefined;
    const maxCount: bigint | undefined =
      options && typeof options === "object" && "maxCount" in options
        ? options.maxCount
        : undefined;

    if (from !== undefined) {
      q = q.where("stream_position", ">=", BigInt(from).toString());
    }
    if (to !== undefined) {
      q = q.where("stream_position", "<=", BigInt(to).toString());
    }
    if (maxCount !== undefined) {
      q = q.limit(Number(maxCount));
    }

    const rows = await q.execute();

    const events = rows.map((row) => {
      const streamPosition = BigInt(String(row.stream_position));
      const globalPosition = BigInt(String(row.global_position));
      const baseMetadata = (row.message_metadata ?? {}) as Record<
        string,
        unknown
      >;
      return {
        kind: "Event" as const,
        type: row.message_type,
        data: row.message_data,
        metadata: {
          ...baseMetadata,
          messageId: row.message_id,
          streamName,
          streamPosition,
          globalPosition,
        },
      };
    });

    return {
      events: events as ReadStreamResult<
        EventType,
        PostgresReadEventMetadata
      >["events"],
      currentStreamVersion,
      streamExists,
    };
  };
}

type AppendToStream = <EventType extends Event>(
  streamName: string,
  events: EventType[],
  options?: ExtendedAppendToStreamOptions,
) => Promise<AppendToStreamResultWithGlobalPosition>;

function createAppendToStream({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}): AppendToStream {
  return async function appendToStream<EventType extends Event>(
    streamId: string,
    events: EventType[],
    options?: ExtendedAppendToStreamOptions,
  ) {
    const partition = options?.partition ?? DEFAULT_PARTITION;
    const streamType = options?.streamType ?? "unknown";
    const expected = options?.expectedStreamVersion;

    logger.info(
      { streamName: streamId, events, options, partition },
      "appendToStream",
    );

    if (events.length === 0) {
      return {
        lastEventGlobalPosition: PostgreSQLEventStoreDefaultGlobalPosition,
        nextExpectedStreamVersion: PostgreSQLEventStoreDefaultStreamVersion,
        createdNewStream: false,
      };
    }

    const result = await db.transaction().execute(async (trx) => {
      // Fetch current stream info
      const current = await trx
        .selectFrom("streams")
        .select(["stream_position"])
        .where("stream_id", "=", streamId)
        .where("partition", "=", partition)
        .where("is_archived", "=", false)
        .executeTakeFirst();

      const currentPos = current
        ? BigInt(String(current.stream_position))
        : PostgreSQLEventStoreDefaultStreamVersion;

      const streamExistsNow = !!current;

      // Expected version handling
      if (expected === STREAM_EXISTS && !streamExistsNow) {
        throw new ExpectedVersionConflictError(-1n, STREAM_EXISTS);
      }
      if (expected === STREAM_DOES_NOT_EXIST && streamExistsNow) {
        throw new ExpectedVersionConflictError(-1n, STREAM_DOES_NOT_EXIST);
      }
      if (typeof expected === "bigint" && expected !== currentPos) {
        throw new ExpectedVersionConflictError(currentPos, expected);
      }

      const basePos = currentPos;
      const nextStreamPosition = basePos + BigInt(events.length);

      // Create or update stream row
      if (!streamExistsNow) {
        await trx
          .insertInto("streams")
          .values({
            stream_id: streamId,
            stream_position: nextStreamPosition.toString(),
            partition,
            stream_type: streamType,
            stream_metadata: {},
            is_archived: false,
          })
          .execute();
      } else {
        if (typeof expected === "bigint") {
          const updatedRow = await trx
            .updateTable("streams")
            .set({ stream_position: nextStreamPosition.toString() })
            .where("stream_id", "=", streamId)
            .where("partition", "=", partition)
            .where("is_archived", "=", false)
            .where("stream_position", "=", basePos.toString())
            .returning("stream_position")
            .executeTakeFirst();
          if (!updatedRow) {
            throw new ExpectedVersionConflictError(basePos, expected);
          }
        } else {
          await trx
            .updateTable("streams")
            .set({ stream_position: nextStreamPosition.toString() })
            .where("stream_id", "=", streamId)
            .where("partition", "=", partition)
            .where("is_archived", "=", false)
            .execute();
        }
      }

      // Prepare messages to insert
      const messagesToInsert = events.map((e, index) => {
        const messageId = randomUUID();
        const streamPosition = basePos + BigInt(index + 1);
        const messageMetadata = {
          messageId,
          ...("metadata" in e ? (e.metadata ?? {}) : {}),
        } as Record<string, unknown>;
        return {
          stream_id: streamId,
          stream_position: streamPosition.toString(),
          partition,
          message_data: e.data as DBSchema["messages"]["message_data"],
          message_metadata:
            messageMetadata as DBSchema["messages"]["message_metadata"],
          message_schema_version: "1",
          message_type: e.type,
          message_kind: "E",
          message_id: messageId,
          is_archived: false,
        };
      });

      const inserted = await trx
        .insertInto("messages")
        .values(messagesToInsert)
        .returning("global_position")
        .execute();

      if (!inserted || inserted.length === 0) {
        throw new ExpectedVersionConflictError(
          -1n,
          expected ?? NO_CONCURRENCY_CHECK,
        );
      }

      const globalPositions = inserted.map((r) =>
        BigInt(String(r.global_position)),
      );
      const lastEventGlobalPosition =
        inserted.length > 0
          ? globalPositions[inserted.length - 1]
          : PostgreSQLEventStoreDefaultGlobalPosition;

      return {
        nextExpectedStreamVersion: nextStreamPosition,
        lastEventGlobalPosition,
        createdNewStream: !streamExistsNow,
      } satisfies AppendToStreamResultWithGlobalPosition;
    });

    return result;
  };
}

type AggregateStream = <State, EventType extends Event>(
  streamName: string,
  options: AggregateStreamOptions<State, EventType, PostgresReadEventMetadata>,
) => Promise<AggregateStreamResult<State>>;

function createAggregateStream(
  {
    readStream,
  }: {
    readStream: ReadStream;
  },
  { logger }: { logger: Logger },
): AggregateStream {
  /**
   * This function is pretty much a copy of the emmett aggregateStream function found in `src/packages/emmett-postgresql/src/eventStore/postgreSQLEventStore.ts`
   */
  const aggregateStream: AggregateStream = async function aggregateStream<
    State,
    EventType extends Event,
  >(
    streamName: string,
    options: AggregateStreamOptions<
      State,
      EventType,
      PostgresReadEventMetadata
    >,
  ): Promise<AggregateStreamResult<State>> {
    const { evolve, initialState, read } = options;
    logger.info({ streamName, options }, "aggregateStream");

    const expectedStreamVersion = read?.expectedStreamVersion;

    const result = await readStream<EventType>(streamName, options.read);
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

  return aggregateStream;
}

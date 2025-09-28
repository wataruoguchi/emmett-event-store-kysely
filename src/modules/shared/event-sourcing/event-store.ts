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
import type { DB } from "../infra/db.js";

type PostgresReadEventMetadata = ReadEventMetadataWithGlobalPosition;
const PostgreSQLEventStoreDefaultGlobalPosition = 0n;
const PostgreSQLEventStoreDefaultStreamVersion = 0n;
const DEFAULT_PARTITION = "default_partition";

export type EventStore = ReturnType<typeof createEventStoreFactory>;
export function createEventStore({ db }: { db: DB }) {
  return createEventStoreFactory({
    readStream: createReadStream({ db }),
    appendToStream: createAppendToStream({ db }),
  });
}

type ReadStream = <EventType extends Event>(
  stream: string,
  options?: ReadStreamOptions & { partition?: string },
) => Promise<ReadStreamResult<EventType, PostgresReadEventMetadata>>;

function createReadStream({ db }: { db: DB }) {
  return async function readStream<EventType extends Event>(
    streamName: string,
    options?: ReadStreamOptions & { partition?: string },
  ) {
    const partition = options?.partition ?? DEFAULT_PARTITION;

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
      ? BigInt(streamRow.stream_position as unknown as string)
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
        ? (options as { from: bigint }).from
        : undefined;
    const to: bigint | undefined =
      options && typeof options === "object" && "to" in options
        ? (options as { to: bigint }).to
        : undefined;
    const maxCount: bigint | undefined =
      options && typeof options === "object" && "maxCount" in options
        ? (options as { maxCount?: bigint }).maxCount
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
        type: row.message_type as string,
        data: row.message_data as Record<string, unknown>,
        metadata: {
          ...baseMetadata,
          messageId: row.message_id as string,
          streamName,
          streamPosition,
          globalPosition,
        },
      } as unknown;
    });

    return {
      events: events as unknown as ReadStreamResult<
        EventType,
        PostgresReadEventMetadata
      >["events"],
      currentStreamVersion,
      streamExists,
    } as ReadStreamResult<EventType, PostgresReadEventMetadata>;
  };
}

type AppendToStream = <EventType extends Event>(
  stream: string,
  events: EventType[],
  options?: AppendToStreamOptions & { partition?: string },
) => Promise<AppendToStreamResultWithGlobalPosition>;

function createAppendToStream({ db }: { db: DB }): AppendToStream {
  return async function appendToStream(streamName, events, options) {
    const partition = options?.partition ?? DEFAULT_PARTITION;

    if (events.length === 0) {
      return {
        lastEventGlobalPosition: PostgreSQLEventStoreDefaultGlobalPosition,
        nextExpectedStreamVersion: PostgreSQLEventStoreDefaultStreamVersion,
        createdNewStream: false,
      };
    }

    // Resolve stream type from name: "type-xyz-..." => type, else fallback
    const [firstPart, ...rest] = streamName.split("-");
    const streamType = firstPart && rest.length > 0 ? firstPart : "emt:unknown";

    const expected = options?.expectedStreamVersion;

    const result = await db.transaction().execute(async (trx) => {
      // Fetch current stream info
      const current = await trx
        .selectFrom("streams")
        .select(["stream_position"])
        .where("stream_id", "=", streamName)
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
            stream_id: streamName,
            stream_position: nextStreamPosition.toString(),
            partition,
            stream_type: streamType,
            stream_metadata: {},
            is_archived: false,
          })
          .execute();
      } else {
        if (typeof expected === "bigint") {
          const upd = await trx
            .updateTable("streams")
            .set({ stream_position: nextStreamPosition.toString() })
            .where("stream_id", "=", streamName)
            .where("partition", "=", partition)
            .where("is_archived", "=", false)
            .where("stream_position", "=", basePos.toString())
            .execute();
          const updated = Number(
            (upd as unknown as { numUpdatedRows?: number | bigint })
              .numUpdatedRows ?? 0,
          );
          if (updated === 0) {
            throw new ExpectedVersionConflictError(basePos, expected);
          }
        } else {
          await trx
            .updateTable("streams")
            .set({ stream_position: nextStreamPosition.toString() })
            .where("stream_id", "=", streamName)
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
          ...("metadata" in e
            ? ((e as unknown as { metadata?: unknown }).metadata ?? {})
            : {}),
        } as Record<string, unknown>;
        return {
          stream_id: streamName,
          stream_position: streamPosition.toString(),
          partition,
          message_data: (e as unknown as { data: unknown })
            .data as unknown as DBSchema["messages"]["message_data"],
          message_metadata:
            messageMetadata as unknown as DBSchema["messages"]["message_metadata"],
          message_schema_version: "1",
          message_type: (e as unknown as { type: string }).type,
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

function createEventStoreFactory({
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

export function getEventStoreForDb(db: DB) {
  return createEventStoreFactory({
    readStream: createReadStream({ db }),
    appendToStream: createAppendToStream({ db }),
  });
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

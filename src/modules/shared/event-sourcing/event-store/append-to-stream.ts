// biome-ignore assist/source/organizeImports: The editor does not behave correctly with this import
import {
  ExpectedVersionConflictError,
  NO_CONCURRENCY_CHECK,
  STREAM_DOES_NOT_EXIST,
  STREAM_EXISTS,
  type AppendToStreamOptions,
  type AppendToStreamResultWithGlobalPosition,
  type Event,
} from "@event-driven-io/emmett";
import type { DB as DBSchema } from "kysely-codegen";
import {
  DEFAULT_PARTITION,
  PostgreSQLEventStoreDefaultStreamVersion,
  type Dependencies,
  type ExtendedOptions,
} from "./types-consts.js";

const PostgreSQLEventStoreDefaultGlobalPosition = 0n;

type ExtendedAppendToStreamOptions = AppendToStreamOptions & ExtendedOptions;
export type AppendToStream = <EventType extends Event>(
  streamId: string,
  events: EventType[],
  options?: ExtendedAppendToStreamOptions,
) => Promise<AppendToStreamResultWithGlobalPosition>;

export function createAppendToStream({
  db,
  logger,
}: Dependencies): AppendToStream {
  /**
   * This is supposed to be equivalent to the emmett appendToStream function.
   * - https://raw.githubusercontent.com/event-driven-io/emmett/c1f0d45e6b233ad645f5ad30ebbd1dc41ae033eb/src/packages/emmett-sqlite/src/eventStore/SQLiteEventStore.ts
   * - https://raw.githubusercontent.com/event-driven-io/emmett/c1f0d45e6b233ad645f5ad30ebbd1dc41ae033eb/src/packages/emmett-sqlite/src/eventStore/schema/appendToStream.ts
   * - https://raw.githubusercontent.com/event-driven-io/emmett/c1f0d45e6b233ad645f5ad30ebbd1dc41ae033eb/src/packages/emmett-postgresql/src/eventStore/postgreSQLEventStore.ts
   * - https://raw.githubusercontent.com/event-driven-io/emmett/c1f0d45e6b233ad645f5ad30ebbd1dc41ae033eb/src/packages/emmett-postgresql/src/eventStore/schema/appendToStream.ts
   */
  return async function appendToStream<EventType extends Event>(
    streamId: string,
    events: EventType[],
    options?: ExtendedAppendToStreamOptions,
  ): Promise<AppendToStreamResultWithGlobalPosition> {
    const streamType = getStreamType(options);
    const partition = getPartition(options);
    const expected = options?.expectedStreamVersion;

    logger.info({ streamId, events, options, partition }, "appendToStream");

    ensureEventsNotEmpty(events, expected);

    const result = await db.transaction().execute(async (trx) => {
      const { currentStreamVersion, streamExists } = await fetchStreamInfo(
        trx,
        streamId,
        partition,
      );

      assertExpectedVersion(expected, currentStreamVersion, streamExists);

      const basePos = currentStreamVersion;
      const nextStreamPosition = computeNextStreamPosition(
        basePos,
        events.length,
      );

      await upsertStreamRow(
        trx,
        streamId,
        partition,
        streamType,
        basePos,
        nextStreamPosition,
        expected,
        streamExists,
      );

      const messagesToInsert = buildMessagesToInsert<EventType>(
        events,
        basePos,
        streamId,
        partition,
      );

      const lastEventGlobalPosition =
        await insertMessagesAndGetLastGlobalPosition(trx, messagesToInsert);

      return {
        nextExpectedStreamVersion: nextStreamPosition,
        lastEventGlobalPosition,
        createdNewStream: !streamExists,
      } satisfies AppendToStreamResultWithGlobalPosition;
    });

    return result;
  };
}

function getStreamType(options?: ExtendedAppendToStreamOptions): string {
  return options?.streamType ?? "unknown";
}

function ensureEventsNotEmpty<EventType extends Event>(
  events: EventType[],
  expected: AppendToStreamOptions["expectedStreamVersion"] | undefined,
): void {
  if (events.length === 0) {
    throw new ExpectedVersionConflictError(
      -1n,
      expected ?? NO_CONCURRENCY_CHECK,
    );
  }
}

function assertExpectedVersion(
  expected: AppendToStreamOptions["expectedStreamVersion"] | undefined,
  currentPos: bigint,
  streamExistsNow: boolean,
): void {
  if (expected === STREAM_EXISTS && !streamExistsNow) {
    throw new ExpectedVersionConflictError(-1n, STREAM_EXISTS);
  }
  if (expected === STREAM_DOES_NOT_EXIST && streamExistsNow) {
    throw new ExpectedVersionConflictError(-1n, STREAM_DOES_NOT_EXIST);
  }
  if (typeof expected === "bigint" && expected !== currentPos) {
    throw new ExpectedVersionConflictError(currentPos, expected);
  }
}

function computeNextStreamPosition(
  basePos: bigint,
  eventCount: number,
): bigint {
  return basePos + BigInt(eventCount);
}

async function upsertStreamRow(
  executor: Dependencies["db"],
  streamId: string,
  partition: string,
  streamType: string,
  basePos: bigint,
  nextStreamPosition: bigint,
  expected: AppendToStreamOptions["expectedStreamVersion"] | undefined,
  streamExistsNow: boolean,
): Promise<void> {
  if (!streamExistsNow) {
    await executor
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
    return;
  }

  if (typeof expected === "bigint") {
    const updatedRow = await executor
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
    return;
  }

  await executor
    .updateTable("streams")
    .set({ stream_position: nextStreamPosition.toString() })
    .where("stream_id", "=", streamId)
    .where("partition", "=", partition)
    .where("is_archived", "=", false)
    .execute();
}

function buildMessagesToInsert<EventType extends Event>(
  events: EventType[],
  basePos: bigint,
  streamId: string,
  partition: string,
) {
  return events.map((e, index) => {
    const messageId = crypto.randomUUID();
    const streamPosition = basePos + BigInt(index + 1);
    const rawMeta = "metadata" in e ? e.metadata : undefined;
    const eventMeta = rawMeta && typeof rawMeta === "object" ? rawMeta : {};
    const messageMetadata = {
      messageId,
      ...eventMeta,
    };
    return {
      stream_id: streamId,
      stream_position: streamPosition.toString(),
      partition,
      message_data: e.data as DBSchema["messages"]["message_data"],
      message_metadata:
        messageMetadata as DBSchema["messages"]["message_metadata"],
      message_schema_version: index.toString(),
      message_type: e.type,
      message_kind: "E",
      message_id: messageId,
      is_archived: false,
    };
  });
}

async function insertMessagesAndGetLastGlobalPosition(
  executor: Dependencies["db"],
  messagesToInsert: Array<{
    stream_id: string;
    stream_position: string;
    partition: string;
    message_data: DBSchema["messages"]["message_data"];
    message_metadata: DBSchema["messages"]["message_metadata"];
    message_schema_version: string;
    message_type: string;
    message_kind: string;
    message_id: string;
    is_archived: boolean;
  }>,
): Promise<bigint> {
  const inserted = await executor
    .insertInto("messages")
    .values(messagesToInsert)
    .returning("global_position")
    .execute();

  if (!inserted || inserted.length === 0) {
    return PostgreSQLEventStoreDefaultGlobalPosition;
  }

  const globalPositions = inserted.map((r) =>
    BigInt(String(r.global_position)),
  );
  return globalPositions[inserted.length - 1];
}

function getPartition(options?: ExtendedOptions): string {
  return options?.partition ?? DEFAULT_PARTITION;
}

async function fetchStreamInfo(
  executor: Dependencies["db"],
  streamId: string,
  partition: string,
): Promise<{ currentStreamVersion: bigint; streamExists: boolean }> {
  const streamRow = await executor
    .selectFrom("streams")
    .select(["stream_position"])
    .where("stream_id", "=", streamId)
    .where("partition", "=", partition)
    .where("is_archived", "=", false)
    .executeTakeFirst();

  const currentStreamVersion = streamRow
    ? BigInt(String(streamRow.stream_position))
    : PostgreSQLEventStoreDefaultStreamVersion;

  return { currentStreamVersion, streamExists: !!streamRow };
}

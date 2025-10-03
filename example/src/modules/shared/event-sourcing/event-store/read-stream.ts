// biome-ignore assist/source/organizeImports: The editor does not behave correctly with this import
import type {
  Event,
  ReadEvent,
  ReadEventMetadataWithGlobalPosition,
  ReadStreamOptions,
  ReadStreamResult,
} from "@event-driven-io/emmett";
import {
  DEFAULT_PARTITION,
  PostgreSQLEventStoreDefaultStreamVersion,
  type Dependencies,
  type ExtendedOptions,
} from "./types-consts.js";

type PostgresReadEventMetadata = ReadEventMetadataWithGlobalPosition;
type ExtendedReadStreamOptions = ReadStreamOptions & ExtendedOptions;

export type ReadStream = <EventType extends Event>(
  stream: string,
  options?: ExtendedReadStreamOptions,
) => Promise<ReadStreamResult<EventType, PostgresReadEventMetadata>>;

/**
 * This should be equivalent to:
 * - https://raw.githubusercontent.com/event-driven-io/emmett/c1f0d45e6b233ad645f5ad30ebbd1dc41ae033eb/src/packages/emmett-sqlite/src/eventStore/SQLiteEventStore.ts
 * - https://raw.githubusercontent.com/event-driven-io/emmett/c1f0d45e6b233ad645f5ad30ebbd1dc41ae033eb/src/packages/emmett-sqlite/src/eventStore/schema/readStream.ts
 * - https://raw.githubusercontent.com/event-driven-io/emmett/c1f0d45e6b233ad645f5ad30ebbd1dc41ae033eb/src/packages/emmett-postgresql/src/eventStore/postgreSQLEventStore.ts
 * - https://raw.githubusercontent.com/event-driven-io/emmett/c1f0d45e6b233ad645f5ad30ebbd1dc41ae033eb/src/packages/emmett-postgresql/src/eventStore/schema/readStream.ts
 */
export function createReadStream({ db, logger }: Dependencies): ReadStream {
  return async function readStream<EventType extends Event>(
    streamId: string,
    options?: ExtendedReadStreamOptions,
  ): Promise<ReadStreamResult<EventType, PostgresReadEventMetadata>> {
    const partition = getPartition(options);
    logger.info({ streamId, options, partition }, "readStream");

    const { currentStreamVersion, streamExists } = await fetchStreamInfo(
      db,
      streamId,
      partition,
    );

    const range = parseRangeOptions(options);
    const rows = await buildEventsQuery(
      { db, logger },
      streamId,
      partition,
      range,
    ).execute();

    const events: ReadStreamResult<
      EventType,
      PostgresReadEventMetadata
    >["events"] = rows.map((row) => mapRowToEvent<EventType>(row, streamId));

    return {
      events,
      currentStreamVersion,
      streamExists,
    };
  };
}

function parseRangeOptions(options?: ExtendedReadStreamOptions): {
  from?: bigint;
  to?: bigint;
  maxCount?: bigint;
} {
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

  return { from, to, maxCount };
}

function buildEventsQuery(
  deps: Dependencies,
  streamId: string,
  partition: string,
  range: { from?: bigint; to?: bigint; maxCount?: bigint },
) {
  const { db } = deps;
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
    .where("stream_id", "=", streamId)
    .where("partition", "=", partition)
    .where("is_archived", "=", false)
    .orderBy("stream_position");

  if (range.from !== undefined) {
    q = q.where("stream_position", ">=", BigInt(range.from).toString());
  }
  if (range.to !== undefined) {
    q = q.where("stream_position", "<=", BigInt(range.to).toString());
  }
  if (range.maxCount !== undefined) {
    q = q.limit(Number(range.maxCount));
  }

  return q;
}

type SelectedMessageRow = {
  message_type: string;
  message_data: unknown;
  message_metadata: unknown;
  stream_position: string | number | bigint;
  global_position: string | number | bigint | null;
  message_id: string;
};

function mapRowToEvent<EventType extends Event>(
  row: SelectedMessageRow,
  streamId: string,
): ReadEvent<EventType, PostgresReadEventMetadata> {
  const streamPosition = BigInt(String(row.stream_position));
  const globalPosition = BigInt(String(row.global_position ?? 0));
  const baseMetadata = (row.message_metadata ?? {}) as Record<string, unknown>;
  return {
    kind: "Event",
    type: row.message_type,
    data: row.message_data as EventType["data"],
    metadata: {
      ...baseMetadata,
      messageId: row.message_id,
      streamId: streamId,
      streamPosition: streamPosition,
      globalPosition: globalPosition,
    },
  } as ReadEvent<EventType, PostgresReadEventMetadata>;
}

function getPartition(options?: ExtendedReadStreamOptions): string {
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
    ? BigInt(streamRow.stream_position)
    : PostgreSQLEventStoreDefaultStreamVersion;

  return { currentStreamVersion, streamExists: !!streamRow };
}

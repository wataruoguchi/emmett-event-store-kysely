/**
 * References:
 * https://github.com/event-driven-io/emmett/blob/main/src/packages/emmett-postgresql/src/eventStore/schema/tables.ts
 */
import { sql, type Kysely } from "kysely";

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  /**
   * ================================================
   * Streams
   * ================================================
   */
  await db.schema
    .createTable("streams")
    .addColumn("stream_id", "text", (col) => col.notNull())
    .addColumn("stream_position", "bigint", (col) => col.notNull())
    .addColumn("partition", "text", (col) => col.notNull())
    .addColumn("stream_type", "text", (col) => col.notNull())
    .addColumn("stream_metadata", "jsonb", (col) => col.notNull())
    .addColumn("is_archived", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addPrimaryKeyConstraint("pk_streams", [
      "stream_id",
      "partition",
      "is_archived",
    ])
    .addUniqueConstraint("uq_streams_stream_id_partition_is_archived", [
      "stream_id",
      "stream_position",
      "partition",
      "is_archived",
    ])
    .modifyEnd(sql` PARTITION BY LIST (partition);`)
    .execute();
  // Unique index for streams
  await sql`CREATE UNIQUE INDEX idx_streams_stream_id_partition_is_archived
  ON streams (stream_id, partition, is_archived)
  INCLUDE (stream_position);`.execute(db);

  /**
   * ================================================
   * Messages
   * ================================================
   */
  const sequenceName = "emt_global_message_position";
  await sql`CREATE SEQUENCE IF NOT EXISTS ${sql.raw(sequenceName)};`.execute(
    db,
  );

  await db.schema
    .createTable("messages")
    .ifNotExists()
    .addColumn("stream_id", "text", (col) => col.notNull())
    .addColumn("stream_position", "bigint", (col) => col.notNull())
    .addColumn("partition", "text", (col) => col.notNull())
    .addColumn("message_kind", "char(1)", (col) => col.notNull().defaultTo("E"))
    .addColumn("message_data", "jsonb", (col) => col.notNull())
    .addColumn("message_metadata", "jsonb", (col) => col.notNull())
    .addColumn("message_schema_version", "text", (col) => col.notNull())
    .addColumn("message_type", "text", (col) => col.notNull())
    .addColumn("message_id", "text", (col) => col.notNull())
    .addColumn("is_archived", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("global_position", "bigint", (col) =>
      col.defaultTo(sql`nextval('${sql.raw(sequenceName)}')`),
    )
    // .addColumn("transaction_id", "xid8", (col) => col.notNull()) // TODO: Let's ignore this for now. I don't know how to handle this.
    .addColumn("created", "timestamptz(3)", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint("pk_messages", [
      "stream_id",
      "stream_position",
      "partition",
      "is_archived",
    ])
    .modifyEnd(sql` PARTITION BY LIST (partition);`)
    .execute();

  /**
   * ================================================
   * Subscriptions
   * ================================================
   */
  await db.schema
    .createTable("subscriptions")
    .ifNotExists()
    .addColumn("subscription_id", "text", (col) => col.notNull())
    .addColumn("version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("partition", "text", (col) => col.notNull())
    .addColumn("last_processed_position", "bigint", (col) => col.notNull())
    // .addColumn('last_processed_transaction_id', 'xid8', (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_subscriptions", [
      "subscription_id",
      "partition",
      "version",
    ])
    .modifyEnd(sql` PARTITION BY LIST (partition);`)
    .execute();
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS streams;`.execute(db);
  await sql`DROP TABLE IF EXISTS messages;`.execute(db);
  await sql`DROP TABLE IF EXISTS subscriptions;`.execute(db);
  await sql`DROP SEQUENCE IF EXISTS emt_global_message_position;`.execute(db);
}

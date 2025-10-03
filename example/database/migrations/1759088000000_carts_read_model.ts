import { sql, type Kysely } from "kysely";

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("carts")
    .ifNotExists()
    .addColumn("tenant_id", "text", (col) => col.notNull())
    .addColumn("cart_id", "text", (col) => col.notNull())
    .addColumn("currency", "text", (col) => col.notNull())
    .addColumn("items_json", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("is_checked_out", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("is_cancelled", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("stream_id", "text", (col) => col.notNull())
    .addColumn("last_stream_position", "bigint", (col) => col.notNull())
    .addColumn("last_global_position", "bigint", (col) => col.notNull())
    .addColumn("partition", "text", (col) =>
      col.notNull().defaultTo("default_partition"),
    )
    .addColumn("created", "timestamptz(3)", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated", "timestamptz(3)", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint("pk_carts", ["tenant_id", "cart_id", "partition"])
    .execute();

  await db.schema
    .createIndex("idx_carts_tenant_partition")
    .on("carts")
    .columns(["tenant_id", "partition"])
    .execute();

  await db.schema
    .createIndex("idx_carts_stream_and_positions")
    .on("carts")
    .columns(["stream_id", "last_stream_position"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex("idx_carts_stream_and_positions")
    .ifExists()
    .execute();
  await db.schema.dropIndex("idx_carts_tenant_partition").ifExists().execute();
  await db.schema.dropTable("carts").ifExists().execute();
}

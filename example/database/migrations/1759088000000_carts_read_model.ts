import { sql, type Kysely } from "kysely";

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("carts")
    .ifNotExists()
    .addColumn("tenant_id", "text", (col) => col.notNull())
    .addColumn("cart_id", "text", (col) => col.notNull())
    // Denormalized columns from snapshot (nullable, populated via mapToColumns)
    .addColumn("currency", "text")
    .addColumn("total", "integer")
    .addColumn("order_id", "text")
    .addColumn("items_json", "jsonb")
    .addColumn("is_checked_out", "boolean")
    .addColumn("is_cancelled", "boolean")
    // Event sourcing columns
    .addColumn("stream_id", "text", (col) => col.notNull())
    .addColumn("last_stream_position", "bigint", (col) => col.notNull())
    .addColumn("last_global_position", "bigint", (col) => col.notNull())
    .addColumn("partition", "text", (col) =>
      col.notNull().defaultTo("default_partition"),
    )
    .addColumn("created", "timestamptz(3)", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("created_by", "text")
    .addColumn("updated", "timestamptz(3)", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_by", "text")
    // Snapshot column - the source of truth
    .addColumn("snapshot", "jsonb", (col) => col.notNull())
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

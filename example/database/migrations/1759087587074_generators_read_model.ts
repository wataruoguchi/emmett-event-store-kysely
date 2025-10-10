import { sql, type Kysely } from "kysely";

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("generators")
    .ifNotExists()
    .addColumn("tenant_id", "text", (col) => col.notNull())
    .addColumn("generator_id", "text", (col) => col.notNull())
    // Denormalized columns from snapshot (nullable, populated via mapToColumns)
    .addColumn("name", "text")
    .addColumn("address", "text")
    .addColumn("generator_type", "text")
    .addColumn("notes", "text")
    .addColumn("is_deleted", "boolean")
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
    .addPrimaryKeyConstraint("pk_generators", [
      "tenant_id",
      "generator_id",
      "partition",
    ])
    .execute();

  await db.schema
    .createIndex("idx_generators_tenant_partition")
    .on("generators")
    .columns(["tenant_id", "partition"])
    .execute();

  /**
   * It let you apply only newer events for the same aggregate stream, making projection handlers idempotent and ordered.
   */
  await db.schema
    .createIndex("idx_generators_stream_and_positions")
    .on("generators")
    .columns(["stream_id", "last_stream_position"])
    .execute();
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("idx_generators_stream_and_positions")
    .ifExists()
    .execute();
  await db.schema
    .dropIndex("idx_generators_tenant_partition")
    .ifExists()
    .execute();
  await db.schema.dropTable("generators").ifExists().execute();
}

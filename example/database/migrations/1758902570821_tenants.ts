import type { Kysely } from "kysely";

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  db.schema
    .createTable("tenants")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.notNull()) // uuid
    .addColumn("tenant_id", "text", (col) => col.notNull()) // name
    .addColumn("name", "text", (col) => col.notNull()) // readable name
    .addPrimaryKeyConstraint("pk_tenants", ["id"])
    .execute();
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  db.schema.dropTable("tenants").execute();
}

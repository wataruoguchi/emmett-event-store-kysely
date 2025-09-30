import type { Event } from "@event-driven-io/emmett";
import { STREAM_DOES_NOT_EXIST, STREAM_EXISTS } from "@event-driven-io/emmett";
import { sql, type Kysely } from "kysely";
import type { DB as DBSchema } from "kysely-codegen";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../dev-tools/database/create-test-db.js";
import type { Logger } from "../infra/logger.js";
import { createEventStore } from "./event-store.js";

type TestEvent = Event<
  "ItemAdded" | "DiscountApplied",
  Record<string, unknown>,
  { meta?: string } | undefined
>;

async function ensureDefaultPartitions(
  db: Kysely<DBSchema>,
  partition: string,
) {
  // Create child partitions for partitioned tables so inserts succeed
  const ident = partition.replace(/[^a-zA-Z0-9_]/g, "_");
  const literal = partition.replace(/'/g, "''");
  await sql
    .raw(
      `CREATE TABLE IF NOT EXISTS streams_${ident} PARTITION OF streams FOR VALUES IN ('${literal}')`,
    )
    .execute(db);
  await sql
    .raw(
      `CREATE TABLE IF NOT EXISTS messages_${ident} PARTITION OF messages FOR VALUES IN ('${literal}')`,
    )
    .execute(db);
  await sql
    .raw(
      `CREATE TABLE IF NOT EXISTS subscriptions_${ident} PARTITION OF subscriptions FOR VALUES IN ('${literal}')`,
    )
    .execute(db);
}
describe("event-store (kysely, pg)", () => {
  let db: Kysely<DBSchema>;
  const defaultPartition = "default_partition";
  const logger = {
    info: vi.fn(),
  } as unknown as Logger;

  beforeAll(async () => {
    const dbName = `event_store_integration_test`;
    db = (await createTestDb(dbName)) as unknown as Kysely<DBSchema>;
    await ensureDefaultPartitions(db, defaultPartition);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("appends and reads events on default partition", async () => {
    const store = createEventStore({ db, logger });
    const streamName = "cart-" + Math.random().toString(36).slice(2, 8);
    const events: TestEvent[] = [
      {
        type: "ItemAdded",
        data: { sku: "A", qty: 1 },
        metadata: { meta: "m1" },
      },
      {
        type: "DiscountApplied",
        data: { percent: 10 },
        metadata: { meta: "m2" },
      },
    ];

    const append1 = await store.appendToStream(streamName, events, {
      expectedStreamVersion: 0n,
      partition: defaultPartition,
    });
    expect(append1.nextExpectedStreamVersion).toBe(2n);
    expect(append1.createdNewStream).toBe(true);
    expect(append1.lastEventGlobalPosition > 0n).toBe(true);

    const append2 = await store.appendToStream(streamName, events, {
      partition: defaultPartition,
    });
    expect(append2.nextExpectedStreamVersion).toBe(4n);
    expect(append2.createdNewStream).toBe(false);

    const read = await store.readStream<TestEvent>(streamName, {
      from: 0n,
      partition: defaultPartition,
    });
    expect(read.streamExists).toBe(true);
    expect(read.currentStreamVersion).toBe(4n);
    expect(read.events).toHaveLength(4);
    const positions = read.events.map((e) => e.metadata.streamPosition);
    expect(positions).toEqual([1n, 2n, 3n, 4n]);
  });

  it("enforces expected version", async () => {
    const store = createEventStore({ db, logger });
    const streamName = "order-" + Math.random().toString(36).slice(2, 8);
    const events: TestEvent[] = [
      { type: "ItemAdded", data: { sku: "B", qty: 2 } },
    ];

    const ok = await store.appendToStream(streamName, events, {
      expectedStreamVersion: 0n,
      partition: defaultPartition,
    });
    expect(ok.nextExpectedStreamVersion).toBe(1n);

    await expect(
      store.appendToStream(streamName, events, {
        expectedStreamVersion: 0n,
        partition: defaultPartition,
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("isolates events by partition", async () => {
    const store = createEventStore({ db, logger });
    const streamName = "acc-" + Math.random().toString(36).slice(2, 8);
    const partitionA = "moduleA__tenantA";
    const partitionB = "moduleA__tenantB";
    await ensureDefaultPartitions(db, partitionA);
    await ensureDefaultPartitions(db, partitionB);

    const events: TestEvent[] = [
      { type: "ItemAdded", data: { sku: "X", qty: 1 } },
    ];
    await store.appendToStream(streamName, events, {
      expectedStreamVersion: 0n,
      partition: partitionA,
    });

    const readOther = await store.readStream<TestEvent>(streamName, {
      from: 0n,
      partition: partitionB,
    });
    expect(readOther.streamExists).toBe(false);
    expect(readOther.events.length).toBe(0);

    const readA = await store.readStream<TestEvent>(streamName, {
      from: 0n,
      partition: partitionA,
    });
    expect(readA.streamExists).toBe(true);
    expect(readA.events.length).toBe(1);
    expect(readA.events[0]?.metadata.streamPosition).toBe(1n);
  });

  it("supports from/to/maxCount options", async () => {
    const store = createEventStore({ db, logger });
    const streamName = "rs-" + Math.random().toString(36).slice(2, 8);
    const events: TestEvent[] = [
      { type: "ItemAdded", data: { n: 1 } },
      { type: "ItemAdded", data: { n: 2 } },
      { type: "ItemAdded", data: { n: 3 } },
      { type: "ItemAdded", data: { n: 4 } },
      { type: "ItemAdded", data: { n: 5 } },
    ];
    await store.appendToStream(streamName, events, {
      expectedStreamVersion: 0n,
      partition: defaultPartition,
    });

    const range = await store.readStream<TestEvent>(streamName, {
      from: 2n,
      to: 4n,
      partition: defaultPartition,
    });
    expect(range.events.map((e) => e.metadata.streamPosition)).toEqual([
      2n,
      3n,
      4n,
    ]);

    const limited = await store.readStream<TestEvent>(streamName, {
      from: 3n,
      maxCount: 2n as unknown as bigint,
      partition: defaultPartition,
    });
    expect(limited.events.map((e) => e.metadata.streamPosition)).toEqual([
      3n,
      4n,
    ]);
  });

  it("handles STREAM_EXISTS / STREAM_DOES_NOT_EXIST expected versions", async () => {
    const store = createEventStore({ db, logger });
    const streamName = "flags-" + Math.random().toString(36).slice(2, 8);

    await expect(
      store.appendToStream(streamName, [{ type: "ItemAdded", data: {} }], {
        expectedStreamVersion: STREAM_EXISTS,
        partition: defaultPartition,
      }),
    ).rejects.toBeInstanceOf(Error);

    await store.appendToStream(streamName, [{ type: "ItemAdded", data: {} }], {
      expectedStreamVersion: 0n,
      partition: defaultPartition,
    });

    await expect(
      store.appendToStream(streamName, [{ type: "ItemAdded", data: {} }], {
        expectedStreamVersion: STREAM_DOES_NOT_EXIST,
        partition: defaultPartition,
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});

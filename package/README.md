# @wataruoguchi/emmett-event-store-kysely

A Kysely-based event store implementation for [Emmett](https://github.com/event-driven-io/emmett), providing event sourcing capabilities with PostgreSQL.

## Features

- **Event Store**: Emmett event store implementation with Kysely
- **Projections**: Read model projections with automatic event processing

## Installation

```bash
npm install @wataruoguchi/emmett-event-store-kysely @event-driven-io/emmett kysely
```

## Database Setup

First, you need to set up the event store tables in your PostgreSQL database. You can achieve this with [the Kysely migration file](https://github.com/wataruoguchi/poc-emmett/blob/main/package/1758758113676_event_sourcing_migration_example.ts)

## Basic Usage

You can find [the complete working example](https://github.com/wataruoguchi/poc-emmett/tree/main/example). The following are some snippets.

### 1. Setting up the Event Store

```typescript
import { createEventStore } from "@wataruoguchi/emmett-event-store-kysely";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

// Set up your Kysely database connection
const db = new Kysely<YourDatabaseSchema>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
    }),
  }),
});

// Create the event store
const eventStore = createEventStore({ db, logger });
```

### 2. Using the Event Store with Emmett

```typescript
import { DeciderCommandHandler } from "@event-driven-io/emmett";
import type { EventStore } from "@wataruoguchi/emmett-event-store-kysely";

// Define your domain events and commands
type CreateCartCommand = {
  type: "CreateCart";
  data: { tenantId: string; cartId: string; currency: string };
};

type CartCreatedEvent = {
  type: "CartCreated";
  data: { tenantId: string; cartId: string; currency: string };
};

// Create your event handler
export function cartEventHandler({
  eventStore,
  getContext,
}: {
  eventStore: EventStore;
  getContext: () => AppContext;
}) {
  const handler = DeciderCommandHandler({
    decide: createDecide(getContext),
    evolve: createEvolve(),
    initialState,
  });

  return {
    create: (cartId: string, data: CreateCartCommand["data"]) =>
      handler(
        eventStore,
        cartId,
        { type: "CreateCart", data },
        { partition: data.tenantId, streamType: "cart" }
      ),
  };
}

// Use in your service
const cartService = createCartService({
  eventStore,
  getContext,
});
```

## Projections (Read Models)

### 1. Creating a Projection

```typescript
import type {
  ProjectionEvent,
  ProjectionRegistry,
} from "@wataruoguchi/emmett-event-store-kysely/projections";

export function cartsProjection(): ProjectionRegistry<DatabaseExecutor> {
  return {
    CartCreated: async (db, event) => {
      await db
        .insertInto("carts")
        .values({
          stream_id: event.metadata.streamId,
          tenant_id: event.data.tenantId,
          cart_id: event.data.cartId,
          currency: event.data.currency,
          items: JSON.stringify([]),
          total: 0,
          last_stream_position: event.metadata.streamPosition,
        })
        .execute();
    },
    ItemAddedToCart: async (db, event) => {
      // Update cart with new item
      await db
        .updateTable("carts")
        .set({
          items: JSON.stringify([...existingItems, event.data.item]),
          total: newTotal,
          last_stream_position: event.metadata.streamPosition,
        })
        .where("stream_id", "=", event.metadata.streamId)
        .execute();
    },
  };
}
```

### 2. Running Projections

```typescript
import {
  createProjectionRegistry,
  createProjectionRunner,
} from "@wataruoguchi/emmett-event-store-kysely/projections";
import { createReadStream } from "@wataruoguchi/emmett-event-store-kysely";

// Set up projection runner
const readStream = createReadStream({ db, logger });
const registry = createProjectionRegistry(cartsProjection());
const runner = createProjectionRunner({
  db,
  readStream,
  registry,
});

// Project events for a specific stream
await runner.projectEvents("carts-read-model", "cart-123", {
  partition: "tenant-456",
  batchSize: 100,
});
```

### 3. Projection Worker

Create a worker to continuously process projections:

```typescript
#!/usr/bin/env node
import { createReadStream } from "@wataruoguchi/emmett-event-store-kysely";
import {
  createProjectionRegistry,
  createProjectionRunner,
} from "@wataruoguchi/emmett-event-store-kysely/projections";

async function main(partition: string) {
  const db = getDb();
  const readStream = createReadStream({ db, logger });
  const registry = createProjectionRegistry(cartsProjection());
  const runner = createProjectionRunner({
    db,
    readStream,
    registry,
  });

  const subscriptionId = "carts-read-model";
  const batchSize = 200;
  const pollIntervalMs = 1000;

  while (true) {
    // Get streams for this partition
    const streams = await db
      .selectFrom("streams")
      .select(["stream_id"])
      .where("is_archived", "=", false)
      .where("partition", "=", partition)
      .where("stream_type", "=", "cart")
      .execute();

    // Process each stream
    for (const stream of streams) {
      await runner.projectEvents(subscriptionId, stream.stream_id, {
        partition,
        batchSize,
      });
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

// Run with: node projection-worker.js tenant-123
main(process.argv[2]);
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

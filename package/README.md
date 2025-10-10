# @wataruoguchi/emmett-event-store-kysely

A Kysely-based event store implementation for [Emmett](https://github.com/event-driven-io/emmett), providing event sourcing capabilities with PostgreSQL.

## Features

- **Event Store** - Full event sourcing with Kysely and PostgreSQL
- **Snapshot Projections** - Recommended approach for read models
- **Event Consumer** - Continuous background event processing
- **Type Safety** - Full TypeScript support with discriminated unions
- **Multi-Tenancy** - Built-in partition support

## Installation

```bash
npm install @wataruoguchi/emmett-event-store-kysely @event-driven-io/emmett kysely pg
```

## Quick Start

### 1. Database Setup

Set up the required PostgreSQL tables using [our migration example](./database/migrations/1758758113676_event_sourcing_migration_example.ts):

```typescript
import { Kysely } from "kysely";

// Required tables: messages, streams, subscriptions
// See docs/database-setup.md for details
```

### 2. Create Event Store

```typescript
import { getKyselyEventStore } from "@wataruoguchi/emmett-event-store-kysely";
import { Kysely, PostgresDialect } from "kysely";

const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
  }),
});

const eventStore = getKyselyEventStore({ 
  db, 
  logger: console,
});
```

### 3. Write Events & Commands & Business Logic & State

Please read <https://event-driven-io.github.io/emmett/getting-started.html>

- [Events](https://event-driven-io.github.io/emmett/getting-started.html#events)
- [Commands](https://event-driven-io.github.io/emmett/getting-started.html#commands)
- [Business logic and decisions](https://event-driven-io.github.io/emmett/getting-started.html#business-logic-and-decisions)
- [Building state from events](https://event-driven-io.github.io/emmett/getting-started.html#building-state-from-events)

### 4. Build Read Models

This package supports "Snapshot Projections".

```typescript
import { 
  createSnapshotProjectionRegistry 
} from "@wataruoguchi/emmett-event-store-kysely/projections";

// Reuse your write model's evolve function!
const registry = createSnapshotProjectionRegistry(
  ["CartCreated", "ItemAdded", "CartCheckedOut"],
  {
    tableName: "carts",
    primaryKeys: ["tenant_id", "cart_id", "partition"],
    extractKeys: (event, partition) => ({
      tenant_id: event.data.eventMeta.tenantId,
      cart_id: event.data.eventMeta.cartId,
      partition,
    }),
    evolve: domainEvolve,      // Reuse from write model!
    initialState,
    mapToColumns: (state) => ({ // Optional: denormalize for queries
      currency: state.currency,
      total: state.status === "checkedOut" ? state.total : null,
    }),
  }
);
```

### 5. Process Events and Update Read Model

```typescript
import { createProjectionRunner } from "@wataruoguchi/emmett-event-store-kysely/projections";

const runner = createProjectionRunner({ 
  db, 
  readStream: eventStore.readStream, 
  registry,
});

await runner.projectEvents("subscription-id", "cart-123", {
  partition: "tenant-456"
});
```

See [Snapshot Projections documentation](./docs/snapshot-projections.md) for details.

## Documentation

📚 **[Complete Documentation](./docs/README.md)**

### Core Guides

- [Database Setup](./docs/database-setup.md) - PostgreSQL schema and requirements
- [Event Store](./docs/event-store.md) - Core event store API
- [Snapshot Projections](./docs/snapshot-projections.md) - Build read models (recommended) ⭐
- [Event Consumer](./docs/consumer.md) - Continuous background processing
- [Projection Runner](./docs/projection-runner.md) - On-demand processing for tests

### Examples

- [Working Example](../example/) - Complete application with carts and generators
- [Migration Example](./database/migrations/1758758113676_event_sourcing_migration_example.ts) - Database setup

## License

MIT

## Contributing

Contributions are welcome! Please see our [GitHub repository](https://github.com/wataruoguchi/poc-emmett) for issues and PRs.

# Emmett EventStore Examples

This directory contains examples demonstrating how to use the `@wataruoguchi/emmett-event-store-kysely` package.

## Overview

The package now provides two APIs:

### 1. **Emmett-Style API** (Recommended) ⭐

Following the patterns from `@event-driven-io/emmett-postgresql`:

```typescript
import { getKyselyEventStore, createKyselyEventStoreConsumer } from "@wataruoguchi/emmett-event-store-kysely";

// Create event store
const eventStore = getKyselyEventStore({ db, logger });

// Use EventStore interface
await eventStore.appendToStream(streamId, events, options);
await eventStore.readStream(streamId, options);
await eventStore.aggregateStream(streamId, options);

// Create consumer
const consumer = createKyselyEventStoreConsumer({ db, logger, consumerName: "my-consumer" });
consumer.subscribe(handler, eventType);
await consumer.start();
```

### 2. **Legacy API** (Backward Compatible)

The original functional approach:

```typescript
import { createEventStore } from "@wataruoguchi/emmett-event-store-kysely";

// Create event store with individual functions
const { readStream, appendToStream, aggregateStream } = createEventStore({ db, logger });

// Use individual functions
await appendToStream(streamId, events, options);
await readStream(streamId, options);
await aggregateStream(streamId, options);
```

## Files

### `emmett-style-usage.ts`

Comprehensive examples showing:

1. **Basic EventStore usage** - Creating carts, adding items, reading events
2. **Event Consumer** - Building read models from events
3. **API Comparison** - Legacy vs Emmett-style
4. **Transactions** - Using `withSession` for transactional operations

### Integration with existing modules

The cart and generator modules now expose both APIs:

```typescript
// Legacy (existing code continues to work)
const cartService = createCartService({ tenantService }, { db, logger });

// Emmett-style (recommended for new code)
const cartService = createCartServiceEmmettStyle({ tenantService }, { db, logger });
```

## Key Benefits of Emmett-Style API

1. ✅ **Better Type Inference** - Works seamlessly with TypeScript
2. ✅ **Consistency** - Matches `@event-driven-io/emmett-postgresql` patterns
3. ✅ **Transaction Support** - Built-in `withSession` for transactional operations
4. ✅ **Schema Management** - Access to schema utilities
5. ✅ **EventStoreSessionFactory** - Support for Emmett's session patterns

## Running the Examples

The examples are integrated into the main application structure. You can:

1. **Use in your services** - Import and use the functions in your domain services
2. **Run tests** - The examples follow the same patterns as the existing tests
3. **Extend** - Use these as templates for your own event sourcing implementations

## Migration Guide

### From Legacy to Emmett-Style

**Before (Legacy):**

```typescript
const { readStream, appendToStream } = createEventStore({ db, logger });
await appendToStream("stream-1", events);
```

**After (Emmett-Style):**

```typescript
const eventStore = getKyselyEventStore({ db, logger });
await eventStore.appendToStream("stream-1", events);
```

Both approaches work and are fully supported! Choose based on your needs:

- **Legacy** - If you prefer functional approach or have existing code
- **Emmett-Style** - If you want consistency with Emmett ecosystem

## Consumer Pattern

The consumer is great for building read models:

```typescript
const consumer = createKyselyEventStoreConsumer({
  db,
  logger,
  consumerName: "cart-read-model",
  batchSize: 50,
  pollingInterval: 1000,
});

// Subscribe to specific events
consumer.subscribe(async (event) => {
  // Update your read model
  await db.insertInto('carts').values({...}).execute();
}, "CartCreated");

await consumer.start();
```

## Further Reading

- [Emmett Documentation](https://event-driven-io.github.io/emmett/)
- [Event Sourcing Patterns](https://event-driven.io/)
- [Package README](../../../package/README.md)

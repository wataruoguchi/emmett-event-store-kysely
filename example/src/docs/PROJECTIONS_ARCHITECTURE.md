# Projections Architecture

This document explains the distinction between **projection registries** and **consumers** in this event-sourced system.

## Key Concepts

### 1. Projection Registry (`cartsProjection()` / `generatorsProjection()`)

**What it is:**
- A plain object mapping event types to handler functions
- The **definition** of how events transform into read model updates
- Pure logic with no execution mechanism

**When to use:**
- ✅ In **tests** for synchronous, on-demand projection
- ✅ For **batch processing** or manual projection triggers
- ✅ When you need **fine-grained control** over projection timing

**When NOT to use:**
- ❌ For continuous background processing in production (use consumers instead)

**Example:**
```typescript
// Get the projection registry
const registry = cartsProjection();

// Use it with the projection runner for on-demand projection
const runner = createProjectionRunner({ db, readStream, registry });
await runner.projectEvents('subscription-id', 'stream-id', { 
  partition: 'tenant-123' 
});
```

---

### 2. Consumer (`createCartsConsumer()` / `createGeneratorsConsumer()`)

**What it is:**
- A running service that continuously polls for events
- The **execution mechanism** that uses the projection registry
- Handles checkpointing, batching, and lifecycle management

**When to use:**
- ✅ In **production** for continuous, automatic read model updates
- ✅ For **background processing** with automatic checkpointing
- ✅ For **real-time or near-real-time** read model consistency

**When NOT to use:**
- ❌ In tests where you need synchronous projection (use registries instead)

**Key Features:**
- Polls for new events at configurable intervals
- Tracks its position automatically (won't reprocess events)
- Processes events in batches for efficiency
- Supports graceful start/stop

**Example:**
```typescript
// Create and start a consumer
const consumer = createCartsConsumer({
  db,
  logger,
  partition: 'tenant-123',
  consumerName: 'carts-tenant-123',
  batchSize: 50,
  pollingInterval: 500 // ms
});

await consumer.start();

// Later, stop gracefully
await consumer.stop();
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Event Store                          │
│  (streams table with events in append-only fashion)     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ Events written here
                      │
         ┌────────────┴────────────┐
         │                         │
         │                         │
    ┌────▼────┐              ┌────▼────────┐
    │  Tests  │              │ Production  │
    └────┬────┘              └────┬────────┘
         │                        │
         │                        │
    ┌────▼─────────────┐    ┌────▼──────────────────┐
    │ cartsProjection()│    │createCartsConsumer()  │
    │  (Registry)      │    │   (Consumer)          │
    │                  │    │                       │
    │ ┌──────────────┐ │    │ Uses cartsProjection()│
    │ │Event->Handler│ │    │ internally            │
    │ │   Mapping    │ │    │                       │
    │ └──────────────┘ │    │ ┌──────────────────┐  │
    └────┬─────────────┘    │ │ Polls for events │  │
         │                  │ │ Tracks position  │  │
         │                  │ │ Applies handlers │  │
    ┌────▼─────────────┐    │ └──────────────────┘  │
    │createProjection  │    └────┬──────────────────┘
    │    Runner        │         │
    │                  │         │
    │ Manual trigger   │         │ Automatic
    │ On-demand        │         │ Continuous
    └────┬─────────────┘         │
         │                       │
         │                       │
         └───────┬───────────────┘
                 │
                 │
         ┌───────▼────────┐
         │  Read Model    │
         │  (carts table) │
         └────────────────┘
```

---

## Usage Patterns

### Pattern 1: Testing (Synchronous Projection)

```typescript
describe('Cart E2E Tests', () => {
  let project: () => Promise<void>;

  beforeAll(() => {
    // Set up on-demand projection for tests
    const { readStream } = createEventStore({ db, logger });
    const registry = createProjectionRegistry(cartsProjection());
    const runner = createProjectionRunner({ db, readStream, registry });
    
    project = async () => {
      const streams = await db
        .selectFrom('streams')
        .select(['stream_id'])
        .where('partition', '=', tenantId)
        .execute();
        
      for (const s of streams) {
        await runner.projectEvents(
          `subscription-${s.stream_id}`,
          s.stream_id,
          { partition: tenantId }
        );
      }
    };
  });

  it('should create a cart', async () => {
    // 1. Execute action
    await cartService.create({ tenantId, cartId, currency: 'USD' });
    
    // 2. Project events (synchronous, controlled)
    await project();
    
    // 3. Verify read model
    const cart = await db
      .selectFrom('carts')
      .where('cart_id', '=', cartId)
      .executeTakeFirst();
    
    expect(cart).toBeDefined();
  });
});
```

### Pattern 2: Production (Continuous Background Processing)

```typescript
// In application bootstrap
async function startApplication({ db, logger }) {
  // Get all active tenants
  const tenants = await db
    .selectFrom('tenants')
    .select('tenant_id')
    .where('is_active', '=', true)
    .execute();

  // Start consumers for each tenant
  const consumers = [];
  
  for (const tenant of tenants) {
    const cartConsumer = createCartsConsumer({
      db,
      logger,
      partition: tenant.tenant_id,
      consumerName: `carts-${tenant.tenant_id}`,
      batchSize: 100,
      pollingInterval: 1000,
    });
    
    await cartConsumer.start();
    consumers.push(cartConsumer);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Shutting down consumers...');
    
    for (const consumer of consumers) {
      await consumer.stop();
    }
    
    process.exit(0);
  });

  return consumers;
}
```

---

## Relationship

**The consumer USES the projection registry:**

```typescript
export function createCartsConsumer({ db, logger, partition, ... }) {
  const consumer = createKyselyEventStoreConsumer({ db, logger, ... });

  // Get the projection registry
  const registry = cartsProjection(); // <-- Uses the registry
  
  // Subscribe all handlers to the consumer
  for (const [eventType, handlers] of Object.entries(registry)) {
    for (const handler of handlers) {
      consumer.subscribe(async (event) => {
        // Convert and apply handler
        await handler({ db, partition }, event);
      }, eventType);
    }
  }

  return consumer;
}
```

---

## Summary

| Aspect | Projection Registry | Consumer |
|--------|-------------------|----------|
| **What** | Definition (mapping) | Execution mechanism |
| **When** | Tests, batch jobs | Production, background |
| **How** | Manual trigger | Automatic polling |
| **Control** | High (you decide when) | Low (runs continuously) |
| **State** | Stateless | Stateful (tracks position) |
| **Use Case** | Synchronous projection | Asynchronous projection |

**Rule of thumb:**
- Use `cartsProjection()` when you need to **control when** events are projected
- Use `createCartsConsumer()` when you want events projected **automatically**


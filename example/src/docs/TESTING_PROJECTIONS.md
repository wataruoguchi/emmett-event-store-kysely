# Testing Projections: Two Approaches

This document explains when and how to test projections using either the **synchronous projection runner** or the **asynchronous consumer**.

## TL;DR

**Use Projection Runner** for 90% of your tests (fast, simple, deterministic)  
**Use Consumer** only when testing consumer-specific behavior

---

## Overview

| Aspect | Projection Runner | Consumer |
|--------|------------------|----------|
| **Execution** | Synchronous, on-demand | Asynchronous, polling-based |
| **Speed** | ⚡ Fast (instant) | 🐌 Slower (polling delay) |
| **Control** | ✅ High (you decide when) | ❌ Low (polls automatically) |
| **Complexity** | ✅ Simple | ❌ Complex (wait helpers) |
| **Production-like** | ❌ No | ✅ Yes |
| **Best for** | Most tests | Consumer-specific tests |

---

## Approach 1: Projection Runner (Recommended) ⭐

### When to Use

✅ **Use for 90%+ of tests:**
- Unit tests
- Integration tests
- E2E tests
- When you need fast, deterministic tests
- When you need precise control

### Basic Example

```typescript
import {
  createProjectionRunner,
  createProjectionRegistry,
} from "@wataruoguchi/emmett-event-store-kysely/projections";
import { getKyselyEventStore } from "@wataruoguchi/emmett-event-store-kysely";
import { cartsSnapshotProjection } from "../service/event-sourcing/cart.read-model.js";

describe("Cart E2E Tests", () => {
  let project: () => Promise<void>;

  beforeAll(async () => {
    // Set up projection runner
    const eventStore = getKyselyEventStore({ db, logger });
    const registry = createProjectionRegistry(cartsSnapshotProjection());
    const runner = createProjectionRunner({ 
      db, 
      readStream: eventStore.readStream, 
      registry 
    });
    
    // Helper function to project all streams in partition
    project = async () => {
      const streams = await db
        .selectFrom("streams")
        .select(["stream_id"])
        .where("partition", "=", tenantId)
        .where("stream_type", "=", "cart")
        .execute();
        
      for (const stream of streams) {
        await runner.projectEvents(
          `test-subscription-${stream.stream_id}`,
          stream.stream_id,
          { partition: tenantId }
        );
      }
    };
  });

  it("should create cart", async () => {
    // 1. Execute command
    await cartService.create({
      tenantId,
      cartId: "cart-123",
      currency: "USD",
    });
    
    // 2. Project events synchronously
    await project();
    
    // 3. Verify read model immediately
    const cart = await db
      .selectFrom("carts")
      .where("cart_id", "=", "cart-123")
      .executeTakeFirstOrThrow();
    
    expect(cart.currency).toBe("USD");
    
    // 4. Verify snapshot state
    const state = cart.snapshot as CartDomainState;
    expect(state.status).toBe("active");
    expect(state.items).toHaveLength(0);
  });
  
  it("should add items to cart", async () => {
    // Create cart
    await cartService.create({
      tenantId,
      cartId: "cart-456",
      currency: "USD",
    });
    await project();
    
    // Add items
    await cartService.addItem({
      tenantId,
      cartId: "cart-456",
      item: { sku: "ITEM-1", quantity: 2, unitPrice: 10 },
    });
    await cartService.addItem({
      tenantId,
      cartId: "cart-456",
      item: { sku: "ITEM-2", quantity: 1, unitPrice: 20 },
    });
    await project();
    
    // Verify
    const cart = await db
      .selectFrom("carts")
      .where("cart_id", "=", "cart-456")
      .executeTakeFirstOrThrow();
    
    const state = cart.snapshot as CartDomainState;
    expect(state.items).toHaveLength(2);
    expect(state.items[0].sku).toBe("ITEM-1");
  });
});
```

### Advantages

✅ **Fast** - No waiting for polling intervals  
✅ **Deterministic** - Events projected exactly when you call `project()`  
✅ **Simple** - No complex wait logic  
✅ **Easy to debug** - Clear execution flow  
✅ **Full control** - Project only when you want

### Pattern: Single Stream

```typescript
it("should handle single stream", async () => {
  const cartId = "cart-123";
  
  // Write events
  await cartService.create({ tenantId, cartId, currency: "USD" });
  await cartService.addItem({ tenantId, cartId, item: {...} });
  
  // Project specific stream
  await runner.projectEvents(
    "test-subscription",
    cartId,
    { partition: tenantId }
  );
  
  // Verify
  const cart = await db
    .selectFrom("carts")
    .where("cart_id", "=", cartId)
    .executeTakeFirstOrThrow();
    
  expect(cart).toBeDefined();
});
```

### Pattern: All Streams in Partition

```typescript
it("should handle multiple streams", async () => {
  // Write events to multiple streams
  await cartService.create({ tenantId, cartId: "cart-1", currency: "USD" });
  await cartService.create({ tenantId, cartId: "cart-2", currency: "EUR" });
  
  // Project all streams
  await project();
  
  // Verify all
  const carts = await db
    .selectFrom("carts")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .execute();
    
  expect(carts).toHaveLength(2);
});
```

---

## Approach 2: Consumer (For Specific Tests)

### When to Use

✅ **Only use when testing consumer behavior:**
- Consumer lifecycle (start/stop)
- Error handling in consumers
- Checkpoint tracking
- Polling behavior
- Real-world timing scenarios

❌ **Don't use for:**
- Regular business logic tests
- Integration tests
- E2E tests (unless testing consumer itself)

### Example

```typescript
import { createKyselyEventStoreConsumer } from "@wataruoguchi/emmett-event-store-kysely";
import { createCartsConsumer } from "../service/event-sourcing/cart.read-model.js";

describe("Cart Consumer", () => {
  let consumer: Awaited<ReturnType<typeof createCartsConsumer>>;

  beforeAll(async () => {
    // Start actual consumer
    consumer = createCartsConsumer({
      db,
      logger,
      partition: tenantId,
      consumerName: "test-carts-consumer",
      batchSize: 10,
      pollingInterval: 100, // Fast polling for tests
    });
    
    await consumer.start();
  });

  afterAll(async () => {
    // Always stop consumer!
    await consumer.stop();
  });

  // Helper to wait for projection
  async function waitForProjection(
    check: () => Promise<boolean>,
    timeoutMs = 2000
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    throw new Error(`Projection did not complete within ${timeoutMs}ms`);
  }

  it("should process CartCreated event", async () => {
    const cartId = "cart-123";
    
    // 1. Execute command
    await cartService.create({ tenantId, cartId, currency: "USD" });
    
    // 2. Wait for consumer to process
    await waitForProjection(async () => {
      const cart = await db
        .selectFrom("carts")
        .where("cart_id", "=", cartId)
        .executeTakeFirst();
      return cart !== undefined;
    });
    
    // 3. Verify read model
    const cart = await db
      .selectFrom("carts")
      .where("cart_id", "=", cartId)
      .executeTakeFirstOrThrow();
    
    expect(cart.currency).toBe("USD");
  });
  
  it("should track checkpoint progress", async () => {
    const cartId = "cart-456";
    
    // Write event
    await cartService.create({ tenantId, cartId, currency: "EUR" });
    
    // Wait for processing
    await waitForProjection(async () => {
      const cart = await db
        .selectFrom("carts")
        .where("cart_id", "=", cartId)
        .executeTakeFirst();
      return cart !== undefined;
    });
    
    // Verify checkpoint was updated
    const subscription = await db
      .selectFrom("subscriptions")
      .selectAll()
      .where("subscription_id", "=", "test-carts-consumer")
      .where("partition", "=", tenantId)
      .executeTakeFirst();
    
    expect(subscription).toBeDefined();
    expect(subscription.last_processed_position).toBeGreaterThan(-1n);
  });
});
```

### Advantages

✅ **Production-like** - Tests actual consumer  
✅ **Real behavior** - Polling, checkpointing, error handling  
✅ **Comprehensive** - Validates complete pipeline

### Disadvantages

❌ **Slower** - Polling delays (even with fast polling)  
❌ **Complex** - Requires wait helpers and timeout logic  
❌ **Flaky** - Can fail if timeouts are too short  
❌ **Resource intensive** - Consumer runs during all tests

---

## Key Differences

### Code Comparison

**Projection Runner:**
```typescript
// Write → Project → Verify (synchronous, fast)
await cartService.create({...});
await project();  // Instant
expect(cart).toBeDefined();
```

**Consumer:**
```typescript
// Write → Wait → Verify (asynchronous, slow)
await cartService.create({...});
await waitForProjection(...);  // Polling delay
expect(cart).toBeDefined();
```

### Execution Flow

**Projection Runner:**
```
Write Event → project() → Read Model ✅
              ↑
              Synchronous, instant
```

**Consumer:**
```
Write Event → ... poll ... → poll → poll → Read Model ✅
              ↑                              
              Asynchronous, delayed
```

---

## Recommendations

### Test Suite Structure

```
tests/
├── cart.e2e.spec.ts           # ✅ Use projection runner (95% of tests)
├── cart.consumer.spec.ts      # ✅ Use consumer (5% - consumer specific)
├── cart.service.spec.ts       # ✅ Unit tests (no projection needed)
└── cart.read-model.spec.ts    # ✅ Projection logic tests
```

### When to Use Each

| Test Type | Tool | Why |
|-----------|------|-----|
| Business logic | Projection Runner | Fast, deterministic |
| Integration tests | Projection Runner | Precise control |
| E2E tests | Projection Runner | Speed matters |
| Consumer lifecycle | Consumer | Testing consumer itself |
| Error handling | Consumer | Real-world scenarios |
| Checkpoint tracking | Consumer | Verify mechanism |

---

## Common Pitfalls

### ❌ Don't: Use consumer for all tests

```typescript
// Too slow, too complex
describe("All Cart Tests", () => {
  let consumer = createCartsConsumer({...});
  
  it("test 1", async () => {
    await action();
    await waitForProjection(...);  // Slow
    await verify();
  });
  
  // ... 50 more tests, all slow
});
```

### ✅ Do: Use projection runner for most tests

```typescript
// Fast, simple, reliable
describe("All Cart Tests", () => {
  const runner = createProjectionRunner({...});
  
  it("test 1", async () => {
    await action();
    await project();  // Fast
    await verify();
  });
  
  // ... 50 more tests, all fast
});
```

### ❌ Don't: Forget to stop consumer

```typescript
beforeAll(async () => {
  consumer = createCartsConsumer({...});
  await consumer.start();
});
// Missing afterAll! Consumer keeps running, tests hang
```

### ✅ Do: Always clean up

```typescript
afterAll(async () => {
  await consumer.stop();
  await db.destroy();
});
```

### ❌ Don't: Use short timeouts

```typescript
// Too short, flaky tests
await waitForProjection(check, 100); // Might fail randomly
```

### ✅ Do: Use reasonable timeouts

```typescript
// Generous timeout for reliability
await waitForProjection(check, 2000); // 2 seconds is safe
```

---

## Helper Functions

### Projection Runner Helper

```typescript
// In test setup
export function createProjectHelper(
  runner: ReturnType<typeof createProjectionRunner>,
  partition: string,
  streamType: string,
) {
  return async () => {
    const streams = await db
      .selectFrom("streams")
      .select(["stream_id"])
      .where("partition", "=", partition)
      .where("stream_type", "=", streamType)
      .execute();
      
    for (const stream of streams) {
      await runner.projectEvents(
        `test-${stream.stream_id}`,
        stream.stream_id,
        { partition }
      );
    }
  };
}

// Usage
const project = createProjectHelper(runner, tenantId, "cart");
await project();
```

### Consumer Wait Helper

```typescript
export async function waitForProjection<T>(
  check: () => Promise<T | null | undefined>,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    errorMessage?: string;
  } = {}
): Promise<T> {
  const {
    timeoutMs = 2000,
    pollIntervalMs = 50,
    errorMessage = "Projection did not complete",
  } = options;
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const result = await check();
    if (result !== null && result !== undefined) {
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  throw new Error(`${errorMessage} within ${timeoutMs}ms`);
}

// Usage
const cart = await waitForProjection(
  () => db.selectFrom("carts").where("cart_id", "=", cartId).executeTakeFirst(),
  { timeoutMs: 3000 }
);
```

---

## Summary

### Rule of Thumb

- 🏃 **Speed matters?** → Projection Runner
- 🎯 **Testing consumer behavior?** → Consumer
- 🤔 **Not sure?** → Projection Runner

### Quick Decision Tree

```
Do you need to test consumer-specific behavior?
  ├─ Yes → Use Consumer
  │   └─ Examples: checkpoint tracking, polling, error handling
  │
  └─ No → Use Projection Runner
      └─ Examples: business logic, integration tests, E2E tests
```

### Example Test Files

- ✅ `cart.e2e.spec.ts` - Projection runner (most tests)
- ✅ `cart.consumer.spec.ts` - Consumer (consumer-specific tests)

**Bottom Line:** Use Projection Runner for 90%+ of tests, Consumer only for consumer-specific behavior testing.

---

**Further Reading:**
- [Projections Architecture](./PROJECTIONS_ARCHITECTURE.md)
- [Package: Projection Runner](../../../../package/docs/projection-runner.md)
- [Package: Consumer](../../../../package/docs/consumer.md)

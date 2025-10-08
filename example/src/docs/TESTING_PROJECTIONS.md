# Testing Projections: Two Approaches

This document explains when and how to test projections using either the **synchronous projection runner** or the **asynchronous consumer**.

## Overview

| Aspect | Projection Runner | Consumer |
|--------|------------------|----------|
| **Execution** | Synchronous, on-demand | Asynchronous, polling-based |
| **Speed** | Fast (instant) | Slower (needs polling time) |
| **Control** | High (you decide when) | Low (polls automatically) |
| **Complexity** | Simple | More complex (needs wait helpers) |
| **Production-like** | ❌ No | ✅ Yes |
| **Best for** | Unit/integration tests | E2E/acceptance tests |

---

## Approach 1: Projection Runner (Recommended for Most Tests)

### When to Use
✅ **Use for most tests** - fast, simple, deterministic
- Unit tests
- Integration tests
- When you need precise control over projection timing
- When speed matters

### Example

```typescript
describe("Cart Projections", () => {
  let project: () => Promise<void>;

  beforeAll(async () => {
    const { readStream } = createEventStore({ db, logger });
    const registry = createProjectionRegistry(cartsProjection());
    const runner = createProjectionRunner({ db, readStream, registry });
    
    // On-demand projection function
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

  it("should project CartCreated event", async () => {
    // 1. Execute action
    await cartService.create({ tenantId, cartId, currency: 'USD' });
    
    // 2. Project events synchronously
    await project();
    
    // 3. Verify read model immediately
    const cart = await db
      .selectFrom('carts')
      .where('cart_id', '=', cartId)
      .executeTakeFirst();
    
    expect(cart).toBeDefined();
    expect(cart?.currency).toBe('USD');
  });
});
```

### Advantages
- ✅ **Fast**: No waiting for polls
- ✅ **Deterministic**: Events are projected exactly when you call `project()`
- ✅ **Simple**: No need for wait helpers or timeouts
- ✅ **Easy to debug**: Clear execution flow

### Disadvantages
- ❌ Not testing the actual production consumer
- ❌ Need to manually call `project()` after each action

---

## Approach 2: Consumer (For Production-like Tests)

### When to Use
Use for **end-to-end or acceptance tests** where you want to test the actual production consumer:
- Testing consumer behavior
- Testing real-world timing scenarios
- Verifying consumer resilience
- Testing the complete system as deployed

### Example

```typescript
describe("Cart Consumer", () => {
  let consumer: Awaited<ReturnType<typeof createCartsConsumer>>;

  beforeAll(async () => {
    // Start the actual consumer
    consumer = createCartsConsumer({
      db,
      logger,
      partition: tenantId,
      batchSize: 10,
      pollingInterval: 100, // Fast polling for tests
    });
    
    await consumer.start();
  });

  afterAll(async () => {
    // Always stop the consumer
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

  it("should project CartCreated event", async () => {
    // 1. Execute action
    await cartService.create({ tenantId, cartId, currency: 'USD' });
    
    // 2. Wait for consumer to process
    await waitForProjection(async () => {
      const cart = await db
        .selectFrom('carts')
        .where('cart_id', '=', cartId)
        .executeTakeFirst();
      return cart !== undefined;
    });
    
    // 3. Verify read model
    const cart = await db
      .selectFrom('carts')
      .where('cart_id', '=', cartId)
      .executeTakeFirst();
    
    expect(cart).toBeDefined();
    expect(cart?.currency).toBe('USD');
  });
});
```

### Advantages
- ✅ **Production-like**: Tests the actual consumer used in production
- ✅ **Real behavior**: Tests polling, checkpointing, error handling
- ✅ **Comprehensive**: Validates the complete projection pipeline

### Disadvantages
- ❌ **Slower**: Need to wait for polling intervals
- ❌ **More complex**: Requires wait helpers and timeout logic
- ❌ **Timing issues**: Can be flaky if timeouts are too short
- ❌ **Resource intensive**: Consumer runs in background during all tests

---

## Key Differences in Code

### Projection Runner Approach
```typescript
// Write event
await eventStore.appendToStream(streamId, [event]);

// Project synchronously - immediate, deterministic
await project();

// Verify immediately
const result = await db.selectFrom('carts')...;
expect(result).toBeDefined();
```

### Consumer Approach
```typescript
// Write event
await eventStore.appendToStream(streamId, [event]);

// Wait for consumer to poll and process - asynchronous
await waitForProjection(async () => {
  const result = await db.selectFrom('carts')...;
  return result !== undefined;
});

// Verify after projection completes
const result = await db.selectFrom('carts')...;
expect(result).toBeDefined();
```

---

## Recommendations

### For Most Tests: Use Projection Runner
```typescript
// ✅ Recommended for 90% of tests
describe("Cart E2E Tests", () => {
  // Use projection runner with on-demand projection
  const runner = createProjectionRunner({ ... });
  
  it("test case", async () => {
    await action();
    await project(); // Explicit, fast, deterministic
    await verify();
  });
});
```

### For Consumer-Specific Tests: Use Consumer
```typescript
// ✅ Only for testing consumer behavior
describe("Cart Consumer Tests", () => {
  // Use actual consumer
  const consumer = createCartsConsumer({ ... });
  
  it("should handle events", async () => {
    await action();
    await waitForProjection(...); // Wait for async processing
    await verify();
  });
});
```

### Test Suite Structure
```
tests/
├── cart.e2e.spec.ts           # Main tests using projection runner
├── cart.consumer.spec.ts      # Consumer-specific tests
├── cart.service.spec.ts       # Service unit tests
└── cart.read-model.spec.ts    # Projection logic unit tests
```

---

## Common Pitfalls

### ❌ Don't: Use consumer for all tests
```typescript
// Too slow, too complex
describe("All Cart Tests", () => {
  let consumer = createCartsConsumer({ ... });
  // Every test needs waitForProjection()
});
```

### ✅ Do: Use projection runner for most tests
```typescript
// Fast, simple, reliable
describe("All Cart Tests", () => {
  const runner = createProjectionRunner({ ... });
  // Tests are fast and deterministic
});
```

### ❌ Don't: Forget to stop the consumer
```typescript
beforeAll(() => {
  consumer = createCartsConsumer({ ... });
  await consumer.start();
});
// Missing afterAll! Consumer keeps running
```

### ✅ Do: Always clean up
```typescript
afterAll(async () => {
  await consumer.stop();
  await db.destroy();
});
```

---

## Summary

**Rule of Thumb:**
- 🏃 **Speed matters?** → Use projection runner
- 🎯 **Testing consumer?** → Use consumer
- 🤔 **Not sure?** → Use projection runner

**Example Test Files:**
- See `cart.e2e.spec.ts` for projection runner approach
- See `cart.consumer.spec.ts` for consumer approach


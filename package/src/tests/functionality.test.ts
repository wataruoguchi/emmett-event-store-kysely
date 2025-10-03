import { describe, expect, it, vi } from "vitest";
import { createEventStore } from "../event-store/index.js";
import { createProjectionRunner } from "../projections/runner.js";
import type {
  Dependencies,
  ProjectionHandler,
  ProjectionRegistry,
} from "../types.js";
import {
  DEFAULT_PARTITION,
  PostgreSQLEventStoreDefaultStreamVersion,
  createProjectionRegistry,
} from "../types.js";
import { createMockDatabase, createMockLogger } from "./test-utils.js";

describe("Package Functionality", () => {
  describe("Event Store Creation", () => {
    it("should create event store with all functions", () => {
      const mockDb = createMockDatabase();
      const mockLogger = createMockLogger();

      const deps: Dependencies = { db: mockDb, logger: mockLogger };
      const eventStore = createEventStore(deps);

      expect(typeof eventStore.readStream).toBe("function");
      expect(typeof eventStore.appendToStream).toBe("function");
      expect(typeof eventStore.aggregateStream).toBe("function");
    });

    it("should create event store with proper dependencies", () => {
      const mockDb = createMockDatabase();
      const mockLogger = createMockLogger();

      const deps: Dependencies = { db: mockDb, logger: mockLogger };
      const eventStore = createEventStore(deps);

      // Verify the functions are created (not just undefined)
      expect(eventStore.readStream).toBeDefined();
      expect(eventStore.appendToStream).toBeDefined();
      expect(eventStore.aggregateStream).toBeDefined();
    });
  });

  describe("Projection Runner Creation", () => {
    it("should create projection runner with projectEvents function", () => {
      const mockDb = createMockDatabase();
      const mockReadStream = vi.fn();
      const registry: ProjectionRegistry = {};

      const runner = createProjectionRunner({
        db: mockDb,
        readStream: mockReadStream,
        registry,
      });

      expect(typeof runner.projectEvents).toBe("function");
    });

    it("should create projection runner with handlers", () => {
      const mockDb = createMockDatabase();
      const mockReadStream = vi.fn();
      const handler: ProjectionHandler = vi.fn();
      const registry: ProjectionRegistry = {
        EventType1: [handler],
      };

      const runner = createProjectionRunner({
        db: mockDb,
        readStream: mockReadStream,
        registry,
      });

      expect(typeof runner.projectEvents).toBe("function");
    });
  });

  describe("Projection Registry", () => {
    it("should combine multiple registries correctly", () => {
      const handler1: ProjectionHandler = vi.fn();
      const handler2: ProjectionHandler = vi.fn();
      const handler3: ProjectionHandler = vi.fn();

      const registry1: ProjectionRegistry = { EventType1: [handler1] };
      const registry2: ProjectionRegistry = { EventType2: [handler2] };
      const registry3: ProjectionRegistry = { EventType1: [handler3] };

      const combined = createProjectionRegistry(
        registry1,
        registry2,
        registry3,
      );

      expect(combined.EventType1).toEqual([handler1, handler3]);
      expect(combined.EventType2).toEqual([handler2]);
    });

    it("should handle empty registries", () => {
      const result = createProjectionRegistry({}, {});
      expect(result).toEqual({});
    });

    it("should handle single registry", () => {
      const handler = vi.fn();
      const registry: ProjectionRegistry = { EventType1: [handler] };
      const result = createProjectionRegistry(registry);
      expect(result).toEqual(registry);
    });
  });

  describe("Type Safety", () => {
    it("should maintain type safety with ProjectionHandler", () => {
      const handler: ProjectionHandler = (ctx, event) => {
        expect(typeof ctx.db).toBe("object");
        expect(typeof ctx.partition).toBe("string");
        expect(typeof event.type).toBe("string");
        expect(typeof event.data).toBe("object");
        expect(typeof event.metadata.streamId).toBe("string");
        expect(typeof event.metadata.streamPosition).toBe("bigint");
        expect(typeof event.metadata.globalPosition).toBe("bigint");
      };

      const mockDb = createMockDatabase();
      const context = { db: mockDb, partition: "test" };
      const event = {
        type: "TestEvent",
        data: { test: "data" },
        metadata: {
          streamId: "test-stream",
          streamPosition: 1n,
          globalPosition: 1n,
        },
      };

      expect(() => handler(context, event)).not.toThrow();
    });

    it("should handle async ProjectionHandler", async () => {
      const handler: ProjectionHandler = async (ctx, event) => {
        expect(typeof ctx.db).toBe("object");
        expect(typeof event.type).toBe("string");
        return Promise.resolve();
      };

      const mockDb = createMockDatabase();
      const context = { db: mockDb, partition: "test" };
      const event = {
        type: "TestEvent",
        data: { test: "data" },
        metadata: {
          streamId: "test-stream",
          streamPosition: 1n,
          globalPosition: 1n,
        },
      };

      await expect(handler(context, event)).resolves.toBeUndefined();
    });
  });

  describe("Constants and Defaults", () => {
    it("should have correct default values", () => {
      expect(PostgreSQLEventStoreDefaultStreamVersion).toBe(0n);
      expect(DEFAULT_PARTITION).toBe("default_partition");
    });
  });
});

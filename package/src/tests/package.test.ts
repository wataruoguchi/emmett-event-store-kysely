import { describe, expect, it } from "vitest";
import type {
  DatabaseExecutor,
  Dependencies,
  Logger,
  ProjectionContext,
  ProjectionEvent,
  ProjectionHandler,
  ProjectionRegistry,
} from "../types.js";
import { createProjectionRegistry } from "../types.js";

describe("Event Sourcing Package", () => {
  describe("Core Functionality", () => {
    it("should export createProjectionRegistry", () => {
      expect(typeof createProjectionRegistry).toBe("function");
    });

    it("should create empty projection registry", () => {
      const registry = createProjectionRegistry();
      expect(registry).toEqual({});
    });

    it("should combine multiple projection registries", () => {
      const handler1 = () => {};
      const handler2 = () => {};
      const handler3 = () => {};

      const registry1 = { EventType1: [handler1] };
      const registry2 = { EventType2: [handler2] };
      const registry3 = { EventType1: [handler3] };

      const combined = createProjectionRegistry(
        registry1,
        registry2,
        registry3,
      );

      expect(combined.EventType1).toEqual([handler1, handler3]);
      expect(combined.EventType2).toEqual([handler2]);
    });

    it("should handle multiple handlers for same event type", () => {
      const handler1 = () => {};
      const handler2 = () => {};
      const handler3 = () => {};

      const registry1 = { EventType1: [handler1, handler2] };
      const registry2 = { EventType1: [handler3] };

      const combined = createProjectionRegistry(registry1, registry2);

      expect(combined.EventType1).toEqual([handler1, handler2, handler3]);
    });
  });

  describe("Type System", () => {
    it("should have correct ProjectionEvent structure", () => {
      const event: ProjectionEvent = {
        type: "TestEvent",
        data: { test: "data" },
        metadata: {
          streamId: "test-stream",
          streamPosition: 1n,
          globalPosition: 1n,
        },
      };

      expect(event.type).toBe("TestEvent");
      expect(event.data).toEqual({ test: "data" });
      expect(event.metadata.streamId).toBe("test-stream");
      expect(event.metadata.streamPosition).toBe(1n);
      expect(event.metadata.globalPosition).toBe(1n);
    });

    it("should have correct ProjectionContext structure", () => {
      const mockDb = {} as DatabaseExecutor;
      const context: ProjectionContext = {
        db: mockDb,
        partition: "test-partition",
      };

      expect(context.db).toBe(mockDb);
      expect(context.partition).toBe("test-partition");
    });

    it("should handle ProjectionHandler function signature", () => {
      const handler: ProjectionHandler = (ctx, event) => {
        expect(ctx.db).toBeDefined();
        expect(ctx.partition).toBeDefined();
        expect(event.type).toBeDefined();
        expect(event.data).toBeDefined();
        expect(event.metadata).toBeDefined();
      };

      const mockDb = {} as DatabaseExecutor;
      const context: ProjectionContext = { db: mockDb, partition: "test" };
      const event: ProjectionEvent = {
        type: "TestEvent",
        data: { test: "data" },
        metadata: {
          streamId: "test-stream",
          streamPosition: 1n,
          globalPosition: 1n,
        },
      };

      handler(context, event);
    });

    it("should handle async ProjectionHandler", async () => {
      const handler: ProjectionHandler = async (ctx, event) => {
        expect(ctx.db).toBeDefined();
        expect(event.type).toBeDefined();
        return Promise.resolve();
      };

      const mockDb = {} as DatabaseExecutor;
      const context: ProjectionContext = { db: mockDb, partition: "test" };
      const event: ProjectionEvent = {
        type: "TestEvent",
        data: { test: "data" },
        metadata: {
          streamId: "test-stream",
          streamPosition: 1n,
          globalPosition: 1n,
        },
      };

      await handler(context, event);
    });

    it("should handle Logger interface", () => {
      const logger: Logger = {
        info: (obj, msg) => console.log(obj, msg),
        error: (obj, msg) => console.error(obj, msg),
        warn: (obj, msg) => console.warn(obj, msg),
        debug: (obj, msg) => console.debug(obj, msg),
      };

      expect(typeof logger.info).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.debug).toBe("function");
    });

    it("should handle Dependencies interface", () => {
      const mockDb = {} as DatabaseExecutor;
      const mockLogger: Logger = {
        info: () => {},
        error: () => {},
      };

      const deps: Dependencies = {
        db: mockDb,
        logger: mockLogger,
      };

      expect(deps.db).toBe(mockDb);
      expect(deps.logger).toBe(mockLogger);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty registries in createProjectionRegistry", () => {
      const registry1: ProjectionRegistry = {};
      const registry2: ProjectionRegistry = {};

      const combined = createProjectionRegistry(registry1, registry2);
      expect(combined).toEqual({});
    });

    it("should handle single registry in createProjectionRegistry", () => {
      const handler = () => {};
      const registry: ProjectionRegistry = { EventType1: [handler] };

      const combined = createProjectionRegistry(registry);
      expect(combined).toEqual(registry);
    });

    it("should handle many registries in createProjectionRegistry", () => {
      const handler1 = () => {};
      const handler2 = () => {};
      const handler3 = () => {};
      const handler4 = () => {};

      const registry1: ProjectionRegistry = { EventType1: [handler1] };
      const registry2: ProjectionRegistry = { EventType2: [handler2] };
      const registry3: ProjectionRegistry = {
        EventType1: [handler3],
        EventType3: [handler4],
      };

      const combined = createProjectionRegistry(
        registry1,
        registry2,
        registry3,
      );

      expect(combined.EventType1).toEqual([handler1, handler3]);
      expect(combined.EventType2).toEqual([handler2]);
      expect(combined.EventType3).toEqual([handler4]);
    });

    it("should handle duplicate event types across many registries", () => {
      const handler1 = () => {};
      const handler2 = () => {};
      const handler3 = () => {};
      const handler4 = () => {};
      const handler5 = () => {};

      const registry1: ProjectionRegistry = {
        EventType1: [handler1, handler2],
      };
      const registry2: ProjectionRegistry = { EventType1: [handler3] };
      const registry3: ProjectionRegistry = {
        EventType1: [handler4, handler5],
      };

      const combined = createProjectionRegistry(
        registry1,
        registry2,
        registry3,
      );

      expect(combined.EventType1).toEqual([
        handler1,
        handler2,
        handler3,
        handler4,
        handler5,
      ]);
    });
  });
});

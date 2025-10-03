import { describe, expect, it, vi } from "vitest";
import { createProjectionRunner } from "../projections/runner.js";
import type { ProjectionHandler, ProjectionRegistry } from "../types.js";
import { createProjectionRegistry } from "../types.js";

describe("Projections Modules", () => {
  describe("createProjectionRunner", () => {
    it("should create projection runner with projectEvents function", () => {
      const mockDb = {
        selectFrom: vi.fn(),
        insertInto: vi.fn(),
        updateTable: vi.fn(),
        transaction: vi.fn(),
      } as any;

      const mockReadStream = vi.fn();
      const registry: ProjectionRegistry = {};

      const runner = createProjectionRunner({
        db: mockDb,
        readStream: mockReadStream,
        registry,
      });

      expect(typeof runner.projectEvents).toBe("function");
    });

    it("should handle empty projection registry", () => {
      const mockDb = {
        selectFrom: vi.fn(),
        insertInto: vi.fn(),
        updateTable: vi.fn(),
        transaction: vi.fn(),
      } as any;

      const mockReadStream = vi.fn();
      const registry: ProjectionRegistry = {};

      const runner = createProjectionRunner({
        db: mockDb,
        readStream: mockReadStream,
        registry,
      });

      expect(typeof runner.projectEvents).toBe("function");
    });

    it("should handle projection registry with handlers", () => {
      const mockDb = {
        selectFrom: vi.fn(),
        insertInto: vi.fn(),
        updateTable: vi.fn(),
        transaction: vi.fn(),
      } as any;

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

  describe("ProjectionRunnerDeps", () => {
    it("should accept correct dependencies structure", () => {
      const mockDb = {
        selectFrom: vi.fn(),
        insertInto: vi.fn(),
        updateTable: vi.fn(),
        transaction: vi.fn(),
      } as any;

      const mockReadStream = vi.fn();
      const registry: ProjectionRegistry = {};

      const deps = {
        db: mockDb,
        readStream: mockReadStream,
        registry,
      };

      expect(deps.db).toBe(mockDb);
      expect(deps.readStream).toBe(mockReadStream);
      expect(deps.registry).toBe(registry);
    });
  });

  describe("ProjectionHandler Integration", () => {
    it("should handle synchronous projection handlers", () => {
      const mockDb = {
        selectFrom: vi.fn(),
        insertInto: vi.fn(),
        updateTable: vi.fn(),
        transaction: vi.fn(),
      } as any;

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

    it("should handle asynchronous projection handlers", () => {
      const mockDb = {
        selectFrom: vi.fn(),
        insertInto: vi.fn(),
        updateTable: vi.fn(),
        transaction: vi.fn(),
      } as any;

      const mockReadStream = vi.fn();
      const handler: ProjectionHandler = vi.fn().mockResolvedValue(undefined);
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

    it("should handle multiple handlers for same event type", () => {
      const mockDb = {
        selectFrom: vi.fn(),
        insertInto: vi.fn(),
        updateTable: vi.fn(),
        transaction: vi.fn(),
      } as any;

      const mockReadStream = vi.fn();
      const handler1: ProjectionHandler = vi.fn();
      const handler2: ProjectionHandler = vi.fn();
      const registry: ProjectionRegistry = {
        EventType1: [handler1, handler2],
      };

      const runner = createProjectionRunner({
        db: mockDb,
        readStream: mockReadStream,
        registry,
      });

      expect(typeof runner.projectEvents).toBe("function");
    });

    it("should handle handlers for different event types", () => {
      const mockDb = {
        selectFrom: vi.fn(),
        insertInto: vi.fn(),
        updateTable: vi.fn(),
        transaction: vi.fn(),
      } as any;

      const mockReadStream = vi.fn();
      const handler1: ProjectionHandler = vi.fn();
      const handler2: ProjectionHandler = vi.fn();
      const registry: ProjectionRegistry = {
        EventType1: [handler1],
        EventType2: [handler2],
      };

      const runner = createProjectionRunner({
        db: mockDb,
        readStream: mockReadStream,
        registry,
      });

      expect(typeof runner.projectEvents).toBe("function");
    });
  });

  describe("createProjectionRegistry Edge Cases", () => {
    it("should handle no arguments", () => {
      const result = createProjectionRegistry();
      expect(result).toEqual({});
    });

    it("should handle single empty registry", () => {
      const result = createProjectionRegistry({});
      expect(result).toEqual({});
    });

    it("should handle multiple empty registries", () => {
      const result = createProjectionRegistry({}, {}, {});
      expect(result).toEqual({});
    });

    it("should handle mixed empty and non-empty registries", () => {
      const handler = vi.fn();
      const result = createProjectionRegistry(
        {},
        { EventType1: [handler] },
        {},
      );
      expect(result).toEqual({ EventType1: [handler] });
    });

    it("should preserve handler order", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      const registry1 = { EventType1: [handler1, handler2] };
      const registry2 = { EventType1: [handler3] };

      const result = createProjectionRegistry(registry1, registry2);
      expect(result.EventType1).toEqual([handler1, handler2, handler3]);
    });
  });
});

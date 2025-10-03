import { describe, expect, it, vi } from "vitest";
import { createEventStore } from "../event-store/index.js";
import { createProjectionRunner } from "../projections/runner.js";
import type { Dependencies, ProjectionRegistry } from "../types.js";
import { createProjectionRegistry } from "../types.js";

describe("Package Integration", () => {
  it("should create event store with all required functions", () => {
    const mockDb = {
      selectFrom: vi.fn(),
      insertInto: vi.fn(),
      updateTable: vi.fn(),
      transaction: vi.fn(),
    } as any;

    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    const deps: Dependencies = {
      db: mockDb,
      logger: mockLogger,
    };

    const eventStore = createEventStore(deps);

    expect(typeof eventStore.readStream).toBe("function");
    expect(typeof eventStore.appendToStream).toBe("function");
    expect(typeof eventStore.aggregateStream).toBe("function");
  });

  it("should create projection runner", () => {
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

  it("should handle projection registry creation", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const registry1: ProjectionRegistry = {
      EventType1: [handler1],
    };

    const registry2: ProjectionRegistry = {
      EventType2: [handler2],
    };

    const combined = createProjectionRegistry(registry1, registry2);

    expect(combined.EventType1).toEqual([handler1]);
    expect(combined.EventType2).toEqual([handler2]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createProjectionRunner } from "../projections/runner.js";
import type { ProjectionRegistry } from "../types.js";
import { createProjectionRegistry } from "../types.js";

describe("Package Integration", () => {
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

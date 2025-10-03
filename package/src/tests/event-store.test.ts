import { describe, expect, it, vi } from "vitest";
import { createAggregateStream } from "../event-store/aggregate-stream.js";
import { createAppendToStream } from "../event-store/append-to-stream.js";
import { createEventStore } from "../event-store/index.js";
import { createReadStream } from "../event-store/read-stream.js";
import type { Dependencies } from "../types.js";

describe("Event Store Modules", () => {
  describe("createEventStore", () => {
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

    it("should return correct EventStore type", () => {
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

      // Verify the structure matches EventStore type
      expect(eventStore).toHaveProperty("readStream");
      expect(eventStore).toHaveProperty("appendToStream");
      expect(eventStore).toHaveProperty("aggregateStream");
    });
  });

  describe("createReadStream", () => {
    it("should create read stream function", () => {
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

      const readStream = createReadStream(deps);
      expect(typeof readStream).toBe("function");
    });
  });

  describe("createAppendToStream", () => {
    it("should create append to stream function", () => {
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

      const appendToStream = createAppendToStream(deps);
      expect(typeof appendToStream).toBe("function");
    });
  });

  describe("createAggregateStream", () => {
    it("should create aggregate stream function", () => {
      const mockReadStream = vi.fn();
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      };

      const deps: Dependencies = {
        db: {} as any,
        logger: mockLogger,
      };

      const aggregateStream = createAggregateStream(
        { readStream: mockReadStream },
        deps,
      );
      expect(typeof aggregateStream).toBe("function");
    });
  });

  describe("Function Signatures", () => {
    it("should create ReadStream function with correct type", () => {
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

      const readStream = createReadStream(deps);

      // Test that it's a function
      expect(typeof readStream).toBe("function");
    });

    it("should create AppendToStream function with correct type", () => {
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

      const appendToStream = createAppendToStream(deps);

      // Test that it's a function
      expect(typeof appendToStream).toBe("function");
    });

    it("should create AggregateStream function with correct type", () => {
      const mockReadStream = vi.fn();
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      };

      const deps: Dependencies = {
        db: {} as any,
        logger: mockLogger,
      };

      const aggregateStream = createAggregateStream(
        { readStream: mockReadStream },
        deps,
      );

      // Test that it's a function
      expect(typeof aggregateStream).toBe("function");
    });
  });
});

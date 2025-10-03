import { describe, expect, it, vi } from "vitest";
import { createAggregateStream } from "../event-store/aggregate-stream.js";
import type { Dependencies } from "../types.js";
import { createMockLogger, createMockReadStreamResult } from "./test-utils.js";

describe("AggregateStream Functionality", () => {
  describe("createAggregateStream", () => {
    it("should aggregate events into state", async () => {
      const mockLogger = createMockLogger();
      const mockReadStream = vi.fn();

      const mockEvents = [
        {
          type: "Added",
          data: { amount: 5 },
          metadata: {
            streamId: "test-stream",
            streamPosition: 1n,
            globalPosition: 1n,
          },
        },
        {
          type: "Added",
          data: { amount: 10 },
          metadata: {
            streamId: "test-stream",
            streamPosition: 2n,
            globalPosition: 2n,
          },
        },
      ];

      mockReadStream.mockResolvedValue(
        createMockReadStreamResult(mockEvents, 2n),
      );

      const deps: Dependencies = { db: {} as any, logger: mockLogger };
      const aggregateStream = createAggregateStream(
        { readStream: mockReadStream },
        deps,
      );

      const result = await aggregateStream("test-stream", {
        evolve: (state, event) => {
          if (event.type === "Added") {
            return {
              ...state,
              sum: (state.sum || 0) + (event.data as any).amount,
            };
          }
          return state;
        },
        initialState: () => ({ sum: 0 }),
      });

      expect(result.state).toEqual({ sum: 15 });
      expect(result.currentStreamVersion).toBe(2n);
      expect(mockReadStream).toHaveBeenCalledWith("test-stream", undefined);
    });

    it("should handle empty stream", async () => {
      const mockLogger = createMockLogger();
      const mockReadStream = vi.fn();

      mockReadStream.mockResolvedValue(createMockReadStreamResult([], 0n));

      const deps: Dependencies = { db: {} as any, logger: mockLogger };
      const aggregateStream = createAggregateStream(
        { readStream: mockReadStream },
        deps,
      );

      const result = await aggregateStream("empty-stream", {
        evolve: (state, event) => state,
        initialState: () => ({ count: 0 }),
      });

      expect(result.state).toEqual({ count: 0 });
      expect(result.currentStreamVersion).toBe(0n);
    });

    it("should handle single event", async () => {
      const mockLogger = createMockLogger();
      const mockReadStream = vi.fn();

      const mockEvents = [
        {
          type: "Created",
          data: { message: "hello" },
          metadata: {
            streamId: "test-stream",
            streamPosition: 1n,
            globalPosition: 1n,
          },
        },
      ];

      mockReadStream.mockResolvedValue(
        createMockReadStreamResult(mockEvents, 1n),
      );

      const deps: Dependencies = { db: {} as any, logger: mockLogger };
      const aggregateStream = createAggregateStream(
        { readStream: mockReadStream },
        deps,
      );

      const result = await aggregateStream("test-stream", {
        evolve: (state, event) => {
          if (event.type === "Created") {
            return { ...state, message: (event.data as any).message };
          }
          return state;
        },
        initialState: () => ({ message: "" }),
      });

      expect(result.state).toEqual({ message: "hello" });
      expect(result.currentStreamVersion).toBe(1n);
    });

    it("should pass through read stream options", async () => {
      const mockLogger = createMockLogger();
      const mockReadStream = vi.fn();

      mockReadStream.mockResolvedValue(createMockReadStreamResult([], 0n));

      const deps: Dependencies = { db: {} as any, logger: mockLogger };
      const aggregateStream = createAggregateStream(
        { readStream: mockReadStream },
        deps,
      );

      await aggregateStream("test-stream", {
        evolve: (state, event) => state,
        initialState: () => ({}),
        read: { maxCount: 10, partition: "custom" },
      });

      expect(mockReadStream).toHaveBeenCalledWith("test-stream", {
        maxCount: 10,
        partition: "custom",
      });
    });

    it("should handle expected stream version mismatch", async () => {
      const mockLogger = createMockLogger();
      const mockReadStream = vi.fn();

      mockReadStream.mockResolvedValue(createMockReadStreamResult([], 2n));

      const deps: Dependencies = { db: {} as any, logger: mockLogger };
      const aggregateStream = createAggregateStream(
        { readStream: mockReadStream },
        deps,
      );

      await expect(
        aggregateStream("test-stream", {
          evolve: (state, event) => state,
          initialState: () => ({}),
          expectedStreamVersion: 1n,
        }),
      ).rejects.toThrow();
    });
  });
});

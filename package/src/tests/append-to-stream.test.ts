import { describe, expect, it, vi } from "vitest";
import { createAppendToStream } from "../event-store/append-to-stream.js";
import type { Dependencies } from "../types.js";
import { createMockDatabase, createMockLogger } from "./test-utils.js";

describe("AppendToStream Functionality", () => {
  describe("createAppendToStream", () => {
    it("should append events to a new stream", async () => {
      const mockDb = createMockDatabase();
      const mockLogger = createMockLogger();

      const mockSelectFrom = mockDb.selectFrom as any;
      const mockInsertInto = mockDb.insertInto as any;
      const mockTransaction = mockDb.transaction as any;

      // Mock stream doesn't exist
      mockSelectFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(null),
      });

      // Mock transaction
      const mockTrx = {
        selectFrom: mockSelectFrom,
        insertInto: mockInsertInto,
      };
      mockTransaction.mockReturnValue({
        execute: vi.fn().mockImplementation(async (callback) => {
          return await callback(mockTrx as any);
        }),
      });

      // Mock insert operations
      mockInsertInto.mockReturnValue({
        values: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ insertId: 1 }),
      });

      const deps: Dependencies = { db: mockDb, logger: mockLogger };
      const appendToStream = createAppendToStream(deps);

      const events = [
        { type: "Event1", data: { test: "data1" } },
        { type: "Event2", data: { test: "data2" } },
      ];

      const result = await appendToStream("new-stream", events);

      expect(result.currentStreamVersion).toBe(2n);
      expect(mockTransaction).toHaveBeenCalled();
      expect(mockInsertInto).toHaveBeenCalledWith("streams");
      expect(mockInsertInto).toHaveBeenCalledWith("events");
    });

    it("should append events to an existing stream", async () => {
      const mockDb = createMockDatabase();
      const mockLogger = createMockLogger();

      const mockSelectFrom = mockDb.selectFrom as any;
      const mockInsertInto = mockDb.insertInto as any;
      const mockTransaction = mockDb.transaction as any;

      // Mock stream exists with version 2
      mockSelectFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({ stream_position: 2n }),
      });

      // Mock transaction
      const mockTrx = {
        selectFrom: mockSelectFrom,
        insertInto: mockInsertInto,
      };
      mockTransaction.mockReturnValue({
        execute: vi.fn().mockImplementation(async (callback) => {
          return await callback(mockTrx as any);
        }),
      });

      // Mock insert operations
      mockInsertInto.mockReturnValue({
        values: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ insertId: 1 }),
      });

      const deps: Dependencies = { db: mockDb, logger: mockLogger };
      const appendToStream = createAppendToStream(deps);

      const events = [{ type: "Event3", data: { test: "data3" } }];

      const result = await appendToStream("existing-stream", events, {
        expectedStreamVersion: 2n,
      });

      expect(result.currentStreamVersion).toBe(3n);
      expect(mockTransaction).toHaveBeenCalled();
    });

    it("should handle expected stream version mismatch", async () => {
      const mockDb = createMockDatabase();
      const mockLogger = createMockLogger();

      const mockSelectFrom = mockDb.selectFrom as any;
      const mockTransaction = mockDb.transaction as any;

      // Mock stream exists with version 3, but we expect version 2
      mockSelectFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({ stream_position: 3n }),
      });

      // Mock transaction
      const mockTrx = {
        selectFrom: mockSelectFrom,
      };
      mockTransaction.mockReturnValue({
        execute: vi.fn().mockImplementation(async (callback) => {
          return await callback(mockTrx as any);
        }),
      });

      const deps: Dependencies = { db: mockDb, logger: mockLogger };
      const appendToStream = createAppendToStream(deps);

      const events = [{ type: "Event1", data: { test: "data1" } }];

      await expect(
        appendToStream("test-stream", events, { expectedStreamVersion: 2n }),
      ).rejects.toThrow();
    });

    it("should handle partition option", async () => {
      const mockDb = createMockDatabase();
      const mockLogger = createMockLogger();

      const mockSelectFrom = mockDb.selectFrom as any;
      const mockInsertInto = mockDb.insertInto as any;
      const mockTransaction = mockDb.transaction as any;

      mockSelectFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(null),
      });

      const mockTrx = {
        selectFrom: mockSelectFrom,
        insertInto: mockInsertInto,
      };
      mockTransaction.mockReturnValue({
        execute: vi.fn().mockImplementation(async (callback) => {
          return await callback(mockTrx as any);
        }),
      });

      mockInsertInto.mockReturnValue({
        values: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ insertId: 1 }),
      });

      const deps: Dependencies = { db: mockDb, logger: mockLogger };
      const appendToStream = createAppendToStream(deps);

      const events = [{ type: "Event1", data: { test: "data1" } }];

      await appendToStream("test-stream", events, {
        partition: "custom-partition",
      });

      // Verify partition was used in insert operations
      const insertCalls = mockInsertInto.mock.calls;
      expect(
        insertCalls.some(
          (call) =>
            call[0] === "streams" &&
            call[1].values.some((v: any) => v.partition === "custom-partition"),
        ),
      ).toBe(true);
    });
  });
});

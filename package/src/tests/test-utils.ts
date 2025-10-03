import { vi } from "vitest";
import type { DatabaseExecutor, Logger } from "../types.js";

export const createMockLogger = (): Logger => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
});

export const createMockDatabase = (): DatabaseExecutor => {
  const mockExecuteTakeFirst = vi.fn();
  const mockExecute = vi.fn();
  const mockWhere = vi.fn().mockReturnThis();
  const mockSelect = vi.fn().mockReturnThis();
  const mockOrderBy = vi.fn().mockReturnThis();
  const mockLimit = vi.fn().mockReturnThis();
  const mockReturning = vi.fn().mockReturnThis();

  const mockSelectFrom = vi.fn().mockReturnValue({
    select: mockSelect,
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
    executeTakeFirst: mockExecuteTakeFirst,
    execute: mockExecute,
  });

  const mockValues = vi.fn().mockReturnThis();
  const mockOnConflict = vi.fn().mockReturnThis();
  const mockInsertInto = vi.fn().mockReturnValue({
    values: mockValues,
    onConflict: mockOnConflict,
    returning: mockReturning,
    execute: mockExecute,
  });

  const mockSet = vi.fn().mockReturnThis();
  const mockUpdateTable = vi.fn().mockReturnValue({
    set: mockSet,
    where: mockWhere,
    execute: mockExecute,
  });

  const mockTransaction = vi.fn().mockReturnValue({
    execute: vi.fn().mockImplementation(async (callback) => {
      const mockTrx = {
        selectFrom: mockSelectFrom,
        insertInto: mockInsertInto,
        updateTable: mockUpdateTable,
      };
      return await callback(mockTrx as any);
    }),
  });

  return {
    selectFrom: mockSelectFrom,
    insertInto: mockInsertInto,
    updateTable: mockUpdateTable,
    transaction: mockTransaction,
  } as any;
};

export const createMockReadStreamResult = (
  events: any[] = [],
  currentStreamVersion: bigint = 0n,
) => ({
  events,
  currentStreamVersion,
});

export const createMockEvent = (type: string, data: any, metadata: any) => ({
  type,
  data,
  metadata,
});

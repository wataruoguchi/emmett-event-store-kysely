import { describe, expect, it, vi } from "vitest";
import { createProjectionRunner } from "../projections/runner.js";
import type { ProjectionHandler, ProjectionRegistry } from "../types.js";
import { createMockDatabase, createMockLogger } from "./test-utils.js";

describe("ProjectionRunner Functionality", () => {
  describe("createProjectionRunner", () => {
    it("should project events with handlers", async () => {
      const mockDb = createMockDatabase();
      const mockLogger = createMockLogger();
      const mockReadStream = vi.fn();

      const mockEvents = [
        {
          type: "Event1",
          data: { test: "data1" },
          metadata: {
            streamId: "test-stream",
            streamPosition: 1n,
            globalPosition: 1n,
          },
        },
        {
          type: "Event2",
          data: { test: "data2" },
          metadata: {
            streamId: "test-stream",
            streamPosition: 2n,
            globalPosition: 2n,
          },
        },
      ];

      mockReadStream.mockResolvedValue({
        events: mockEvents,
        currentStreamVersion: 2n,
      });

      const handler1: ProjectionHandler = vi.fn();
      const handler2: ProjectionHandler = vi.fn();
      const registry: ProjectionRegistry = {
        Event1: [handler1],
        Event2: [handler2],
      };

      const runner = createProjectionRunner({
        db: mockDb,
        readStream: mockReadStream,
        registry,
      });

      await runner.projectEvents("test-stream", "test-partition");

      expect(handler1).toHaveBeenCalledWith(
        { db: mockDb, partition: "test-partition" },
        mockEvents[0],
      );
      expect(handler2).toHaveBeenCalledWith(
        { db: mockDb, partition: "test-partition" },
        mockEvents[1],
      );
    });

    it("should handle empty registry", async () => {
      const mockDb = createMockDatabase();
      const mockLogger = createMockLogger();
      const mockReadStream = vi.fn();

      mockReadStream.mockResolvedValue({
        events: [],
        currentStreamVersion: 0n,
      });

      const registry: ProjectionRegistry = {};

      const runner = createProjectionRunner({
        db: mockDb,
        readStream: mockReadStream,
        registry,
      });

      await runner.projectEvents("test-stream", "test-partition");

      // Should not throw even with empty registry
      expect(mockReadStream).toHaveBeenCalledWith("test-stream");
    });

    it("should handle multiple handlers for same event type", async () => {
      const mockDb = createMockDatabase();
      const mockLogger = createMockLogger();
      const mockReadStream = vi.fn();

      const mockEvents = [
        {
          type: "Event1",
          data: { test: "data1" },
          metadata: {
            streamId: "test-stream",
            streamPosition: 1n,
            globalPosition: 1n,
          },
        },
      ];

      mockReadStream.mockResolvedValue({
        events: mockEvents,
        currentStreamVersion: 1n,
      });

      const handler1: ProjectionHandler = vi.fn();
      const handler2: ProjectionHandler = vi.fn();
      const registry: ProjectionRegistry = {
        Event1: [handler1, handler2],
      };

      const runner = createProjectionRunner({
        db: mockDb,
        readStream: mockReadStream,
        registry,
      });

      await runner.projectEvents("test-stream", "test-partition");

      expect(handler1).toHaveBeenCalledWith(
        { db: mockDb, partition: "test-partition" },
        mockEvents[0],
      );
      expect(handler2).toHaveBeenCalledWith(
        { db: mockDb, partition: "test-partition" },
        mockEvents[0],
      );
    });

    it("should handle async handlers", async () => {
      const mockDb = createMockDatabase();
      const mockLogger = createMockLogger();
      const mockReadStream = vi.fn();

      const mockEvents = [
        {
          type: "Event1",
          data: { test: "data1" },
          metadata: {
            streamId: "test-stream",
            streamPosition: 1n,
            globalPosition: 1n,
          },
        },
      ];

      mockReadStream.mockResolvedValue({
        events: mockEvents,
        currentStreamVersion: 1n,
      });

      const handler: ProjectionHandler = vi.fn().mockResolvedValue(undefined);
      const registry: ProjectionRegistry = {
        Event1: [handler],
      };

      const runner = createProjectionRunner({
        db: mockDb,
        readStream: mockReadStream,
        registry,
      });

      await runner.projectEvents("test-stream", "test-partition");

      expect(handler).toHaveBeenCalledWith(
        { db: mockDb, partition: "test-partition" },
        mockEvents[0],
      );
    });

    it("should handle events with no matching handlers", async () => {
      const mockDb = createMockDatabase();
      const mockLogger = createMockLogger();
      const mockReadStream = vi.fn();

      const mockEvents = [
        {
          type: "UnhandledEvent",
          data: { test: "data1" },
          metadata: {
            streamId: "test-stream",
            streamPosition: 1n,
            globalPosition: 1n,
          },
        },
      ];

      mockReadStream.mockResolvedValue({
        events: mockEvents,
        currentStreamVersion: 1n,
      });

      const handler: ProjectionHandler = vi.fn();
      const registry: ProjectionRegistry = {
        Event1: [handler],
      };

      const runner = createProjectionRunner({
        db: mockDb,
        readStream: mockReadStream,
        registry,
      });

      await runner.projectEvents("test-stream", "test-partition");

      // Handler should not be called for unhandled event
      expect(handler).not.toHaveBeenCalled();
    });
  });
});

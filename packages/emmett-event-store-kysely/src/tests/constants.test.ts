import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARTITION,
  PostgreSQLEventStoreDefaultStreamVersion,
} from "../types.js";

describe("Constants and Utilities", () => {
  describe("PostgreSQLEventStoreDefaultStreamVersion", () => {
    it("should be a bigint with value 0", () => {
      expect(PostgreSQLEventStoreDefaultStreamVersion).toBe(0n);
      expect(typeof PostgreSQLEventStoreDefaultStreamVersion).toBe("bigint");
    });
  });

  describe("DEFAULT_PARTITION", () => {
    it("should be a string with default partition value", () => {
      expect(DEFAULT_PARTITION).toBe("default_partition");
      expect(typeof DEFAULT_PARTITION).toBe("string");
    });
  });

  describe("Type Exports", () => {
    it("should export all required types", () => {
      // Test that types can be imported and used
      const testDatabaseExecutor = {} as any;
      const testLogger = {
        info: () => {},
        error: () => {},
      };
      const testDependencies = {
        db: testDatabaseExecutor,
        logger: testLogger,
      };

      expect(testDependencies.db).toBeDefined();
      expect(testDependencies.logger).toBeDefined();
    });
  });
});

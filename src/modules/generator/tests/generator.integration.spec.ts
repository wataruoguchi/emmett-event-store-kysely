import { faker } from "@faker-js/faker";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../dev-tools/database/create-test-db.js";
import type { DB } from "../../shared/infra/db.js";
import { generatorInterface } from "../interface/generator.interface.js";

describe("Generator Integration", () => {
  const TEST_DB_NAME = "generator_integration_test";
  const TENANT_ID = "123";
  let app: Hono;
  let db: DB;

  beforeAll(async () => {
    db = await createTestDb(TEST_DB_NAME);
    app = new Hono();
    app.route("", generatorInterface);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("should create a generator", async () => {
    const generatorData = generateGeneratorData();
    const response = await app.request(`/api/tenants/${TENANT_ID}/generators`, {
      method: "POST",
      body: JSON.stringify(generatorData),
    });
    expect(response.status).toBe(201);
  });
});

function generateGeneratorData() {
  return {
    name: faker.company.name(),
    address: faker.location.streetAddress(),
    notes: faker.lorem.sentence(),
    generatorType: faker.helpers.arrayElement([
      "commercial",
      "residential",
      "industrial",
      "agricultural",
      "other",
    ]),
  };
}

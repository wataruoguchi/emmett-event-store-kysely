import { faker } from "@faker-js/faker";
import type { Hono } from "hono";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createTestDb } from "../../../dev-tools/database/create-test-db.js";
import type { DatabaseExecutor } from "../../shared/infra/db.js";
import type { Logger } from "../../shared/infra/logger.js";
import { createTenantApp, createTenantService } from "../tenant.index.js";

describe("Tenant Integration", () => {
  const TEST_DB_NAME = "tenant_e2e_test";
  let app: Hono;
  let db: DatabaseExecutor;
  const logger = {
    info: vi.fn(),
  } as unknown as Logger;

  beforeAll(async () => {
    db = await createTestDb(TEST_DB_NAME);
    app = createTenantApp({
      tenantService: createTenantService({ db, logger }),
      logger,
    });
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("should create a tenant", async () => {
    const tenantData = generateTenantData();
    const response = await app.request(`/api/tenants`, {
      method: "POST",
      body: JSON.stringify(tenantData),
    });
    expect(response.status).toBe(201);
  });

  describe("when a tenant is created", () => {
    let postResponsePayload: { id: string; tenant_id: string };
    beforeAll(async () => {
      const tenantData = generateTenantData();
      const response = await app.request(`/api/tenants`, {
        method: "POST",
        body: JSON.stringify(tenantData),
      });
      postResponsePayload = await response.json();
    });

    it("should get a tenant by id", async () => {
      const tenantId = postResponsePayload.id;
      const getResponse = await app.request(`/api/tenants/${tenantId}`, {
        method: "GET",
      });
      expect(getResponse.status).toBe(200);
      expect((await getResponse.json()).id).toEqual(postResponsePayload.id);
    });

    it("should get a tenant by tenant id", async () => {
      const tenantId = postResponsePayload.tenant_id;
      const getResponse = await app.request(`/api/tenants/${tenantId}`, {
        method: "GET",
      });
      expect(getResponse.status).toBe(200);
      expect((await getResponse.json()).tenant_id).toEqual(
        postResponsePayload.tenant_id,
      );
    });
  });
});

function generateTenantData() {
  const companyName = faker.company.name();
  return {
    tenantId: companyName.replace(/ /g, "").toLowerCase(),
    name: companyName,
  };
}

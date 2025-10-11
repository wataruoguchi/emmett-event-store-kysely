/**
 * Cart Repository Adapter - Implements the outbound repository port
 * This is the persistence adapter using Kysely for read model queries
 */

import type { DatabaseExecutor } from "../../../../../modules/shared/infra/db.js";
import type { Logger } from "../../../../../modules/shared/infra/logger.js";
import type {
  CartReadModel,
  CartRepositoryPort,
} from "../../../application/ports/outbound/cart-repository.port.js";

export function createCartRepository({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}): CartRepositoryPort {
  return {
    async findById(
      tenantId: string,
      cartId: string,
    ): Promise<CartReadModel | undefined> {
      logger.info({ tenantId, cartId }, "cart.repository.findById");
      const result = await db
        .selectFrom("carts")
        .where("tenant_id", "=", tenantId)
        .where("cart_id", "=", cartId)
        .select([
          "tenant_id",
          "cart_id",
          "currency",
          "items_json",
          "is_checked_out",
          "is_cancelled",
          "created",
          "updated",
        ])
        .executeTakeFirst();
      return result ? mapToReadModel(result) : undefined;
    },
    async findByTenantId(tenantId: string): Promise<CartReadModel[]> {
      logger.info({ tenantId }, "cart.repository.findByTenantId");
      const results = await db
        .selectFrom("carts")
        .where("tenant_id", "=", tenantId)
        .select([
          "tenant_id",
          "cart_id",
          "currency",
          "items_json",
          "is_checked_out",
          "is_cancelled",
          "created",
          "updated",
        ])
        .execute();
      return results.map(mapToReadModel);
    },
  };
}

function mapToReadModel(row: {
  tenant_id: string;
  cart_id: string;
  currency: string | null;
  items_json: any;
  is_checked_out: boolean | null;
  is_cancelled: boolean | null;
  created: Date;
  updated: Date;
}): CartReadModel {
  return {
    tenant_id: row.tenant_id,
    cart_id: row.cart_id,
    currency: row.currency ?? "",
    items_json:
      typeof row.items_json === "string"
        ? row.items_json
        : JSON.stringify(row.items_json),
    is_checked_out: row.is_checked_out ?? false,
    is_cancelled: row.is_cancelled ?? false,
    created: row.created,
    updated: row.updated,
  };
}

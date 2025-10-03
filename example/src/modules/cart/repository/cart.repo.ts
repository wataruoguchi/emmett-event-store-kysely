import type { DatabaseExecutor } from "../../shared/infra/db.js";
import type { Logger } from "../../shared/infra/logger.js";

export type CartRepository = ReturnType<typeof createCartRepository>;

export function createCartRepository({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}) {
  return {
    async findById(tenantId: string, cartId: string) {
      logger.info({ tenantId, cartId }, "cart.findById");
      return await db
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
    },
    async findByTenantId(tenantId: string) {
      logger.info({ tenantId }, "cart.findByTenantId");
      return await db
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
    },
  };
}

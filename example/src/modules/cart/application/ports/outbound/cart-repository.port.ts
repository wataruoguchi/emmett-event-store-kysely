/**
 * Outbound Port - Defines what the Cart module needs from read model persistence
 */

export interface CartRepositoryPort {
  findById(
    tenantId: string,
    cartId: string,
  ): Promise<CartReadModel | undefined>;
  findByTenantId(tenantId: string): Promise<CartReadModel[]>;
}

export type CartReadModel = {
  tenant_id: string;
  cart_id: string;
  currency: string;
  items_json: string;
  is_checked_out: boolean;
  is_cancelled: boolean;
  created: Date;
  updated: Date;
};

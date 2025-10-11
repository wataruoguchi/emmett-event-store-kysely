/**
 * Inbound Port - Defines what the Cart module offers to the outside world
 * This is the contract that external modules should depend on
 */

import type { CartEntity, CartItem } from "../../../domain/cart.entity.js";

export interface CartPort {
  // Commands (write operations)
  create(input: {
    tenantId: string;
    currency: string;
  }): Promise<{ cartId: string }>;

  addItem(input: {
    tenantId: string;
    cartId: string;
    item: CartItem;
  }): Promise<void>;

  removeItem(input: {
    tenantId: string;
    cartId: string;
    sku: string;
    quantity: number;
  }): Promise<void>;

  empty(input: { tenantId: string; cartId: string }): Promise<void>;

  checkout(input: { tenantId: string; cartId: string }): Promise<void>;

  cancel(input: {
    tenantId: string;
    cartId: string;
    reason: string;
  }): Promise<void>;

  // Queries (read operations)
  findById(input: { tenantId: string; cartId: string }): Promise<CartEntity>;

  findAllByTenant(input: { tenantId: string }): Promise<CartEntity[]>;
}

/**
 * Cart Application Service - Implements the inbound port (use cases)
 * Contains the application logic and orchestrates domain operations
 */

import { CartEntitySchema, CartItemSchema } from "../../domain/cart.entity.js";
import type { CartEventHandler } from "../event-sourcing/cart.event-handler.js";
import type { CartPort } from "../ports/inbound/cart.port.js";
import type { CartRepositoryPort } from "../ports/outbound/cart-repository.port.js";
import type { TenantServicePort } from "../ports/outbound/tenant-service.port.js";

type Dependencies = {
  eventHandler: CartEventHandler;
  repository: CartRepositoryPort;
  tenantService: TenantServicePort;
};

export function createCartService(deps: Dependencies): CartPort {
  return {
    create: createCreateCartUseCase(deps),
    addItem: createAddItemUseCase(deps),
    removeItem: createRemoveItemUseCase(deps),
    empty: createEmptyCartUseCase(deps),
    checkout: createCheckoutCartUseCase(deps),
    cancel: createCancelCartUseCase(deps),
    findById: createGetCartUseCase(deps),
    findAllByTenant: createGetCartsUseCase(deps),
  };
}

/**
 * The write services should not check whether the cart exists in the read model.
 * They should not depend on the read model.
 * We use assertions in `createDecide` in `cart.event-handler.ts` to ensure
 * that the cart exists in the write model.
 */
function createCreateCartUseCase({
  eventHandler,
  tenantService,
}: Pick<Dependencies, "eventHandler" | "tenantService">) {
  return async (input: unknown) => {
    if (!input || typeof input !== "object") {
      throw new Error("Input must be an object");
    }
    const parsed = CartEntitySchema.pick({
      tenantId: true,
      currency: true,
    }).parse(input);
    const cartId = crypto.randomUUID();
    const withId = { ...parsed, cartId };

    // Verify tenant exists
    await tenantService.findById(withId.tenantId);

    await eventHandler.create(cartId, withId);
    return { cartId };
  };
}

function createAddItemUseCase({
  eventHandler,
  tenantService,
}: Pick<Dependencies, "eventHandler" | "tenantService">) {
  return async (input: unknown) => {
    const schema = CartEntitySchema.pick({
      tenantId: true,
      cartId: true,
    }).extend({
      item: CartItemSchema,
    });
    const parsed = schema.parse(input);

    await tenantService.findById(parsed.tenantId);

    await eventHandler.addItem(parsed.cartId, {
      tenantId: parsed.tenantId,
      item: parsed.item,
    });
  };
}

function createRemoveItemUseCase({
  eventHandler,
  tenantService,
}: Pick<Dependencies, "eventHandler" | "tenantService">) {
  return async (input: unknown) => {
    const schema = CartEntitySchema.pick({
      tenantId: true,
      cartId: true,
    }).extend({
      sku: CartItemSchema.shape.sku,
      quantity: CartItemSchema.shape.quantity,
    });
    const parsed = schema.parse(input);

    await tenantService.findById(parsed.tenantId);

    await eventHandler.removeItem(parsed.cartId, {
      tenantId: parsed.tenantId,
      sku: parsed.sku,
      quantity: parsed.quantity,
    });
  };
}

function createEmptyCartUseCase({
  eventHandler,
  tenantService,
}: Pick<Dependencies, "eventHandler" | "tenantService">) {
  return async (input: unknown) => {
    const schema = CartEntitySchema.pick({ tenantId: true, cartId: true });
    const parsed = schema.parse(input);

    await tenantService.findById(parsed.tenantId);

    await eventHandler.empty(parsed.cartId, { tenantId: parsed.tenantId });
  };
}

function createCheckoutCartUseCase({
  eventHandler,
  tenantService,
}: Pick<Dependencies, "eventHandler" | "tenantService">) {
  return async (input: unknown) => {
    const schema = CartEntitySchema.pick({
      tenantId: true,
      cartId: true,
    });
    const parsed = schema.parse(input);

    await tenantService.findById(parsed.tenantId);

    await eventHandler.checkout(parsed.cartId, {
      tenantId: parsed.tenantId,
    });
  };
}

function createCancelCartUseCase({
  eventHandler,
  tenantService,
}: Pick<Dependencies, "eventHandler" | "tenantService">) {
  return async (input: unknown) => {
    const schema = CartEntitySchema.pick({
      tenantId: true,
      cartId: true,
    }).extend({
      reason: CartItemSchema.shape.name.min(1),
    });
    const parsed = schema.parse(input);

    await tenantService.findById(parsed.tenantId);

    await eventHandler.cancel(parsed.cartId, {
      tenantId: parsed.tenantId,
      reason: parsed.reason,
    });
  };
}

function createGetCartUseCase({
  repository,
  tenantService,
}: Pick<Dependencies, "repository" | "tenantService">) {
  return async ({ tenantId, cartId }: { tenantId: string; cartId: string }) => {
    await tenantService.findById(tenantId);

    const cart = await repository.findById(tenantId, cartId);
    if (!cart) throw new Error("Cart not found");

    // Map read model to domain entity
    return {
      tenantId: cart.tenant_id,
      cartId: cart.cart_id,
      currency: cart.currency,
      items: JSON.parse(cart.items_json),
      isCheckedOut: cart.is_checked_out,
      isCancelled: cart.is_cancelled,
    };
  };
}

function createGetCartsUseCase({
  repository,
  tenantService,
}: Pick<Dependencies, "repository" | "tenantService">) {
  return async ({ tenantId }: { tenantId: string }) => {
    await tenantService.findById(tenantId);

    const carts = await repository.findByTenantId(tenantId);

    // Map read models to domain entities
    return carts.map((cart) => ({
      tenantId: cart.tenant_id,
      cartId: cart.cart_id,
      currency: cart.currency,
      items: JSON.parse(cart.items_json),
      isCheckedOut: cart.is_checked_out,
      isCancelled: cart.is_cancelled,
    }));
  };
}

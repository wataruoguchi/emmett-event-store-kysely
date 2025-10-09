import type { TenantService } from "../../tenant/tenant.index.js";
import { CartEntitySchema, CartItemSchema } from "../domain/cart.entity.js";
import type { CartRepository } from "../repository/cart.repo.js";
import type { CartEventHandler } from "./event-sourcing/cart.event-handler.js";

type Dependencies = {
  handler: CartEventHandler;
  repository: CartRepository;
  findTenantByIdService: TenantService["get"];
};

export type CartService = ReturnType<typeof createCartServiceFactory>;

export function createCartServiceFactory(deps: Dependencies) {
  /**
   * The Writes services should not check whether the cart exists in the read model.
   * They should not depend on the read model.
   *
   * We use assertions in `createDecide` in `cart.event-handler.ts` to ensure that the cart exists in the write model.
   */
  return {
    create: createCreateCartService(deps),
    addItem: createAddItemService(deps),
    removeItem: createRemoveItemService(deps),
    empty: createEmptyCartService(deps),
    checkout: createCheckoutCartService(deps),
    cancel: createCancelCartService(deps),
    get: createGetCartService(deps),
    getAll: createGetCartsService(deps),
  };
}

function createCreateCartService({
  handler,
  findTenantByIdService,
}: Pick<Dependencies, "handler" | "findTenantByIdService">) {
  return async (input: unknown) => {
    if (!input || typeof input !== "object") {
      throw new Error("Input must be an object");
    }
    const parsed = CartEntitySchema.pick({
      tenantId: true,
      currency: true,
    }).parse(input);
    const withId = { ...parsed, cartId: crypto.randomUUID() };

    const tenant = await findTenantByIdService(withId.tenantId);
    if (!tenant) throw new Error("Tenant not found");
    return await handler.create(withId.cartId, withId);
  };
}

function createAddItemService({
  handler,
  findTenantByIdService,
}: Pick<Dependencies, "handler" | "findTenantByIdService">) {
  return async (input: unknown) => {
    const schema = CartEntitySchema.pick({
      tenantId: true,
      cartId: true,
    }).extend({
      item: CartItemSchema,
    });
    const parsed = schema.parse(input);
    const tenant = await findTenantByIdService(parsed.tenantId);
    if (!tenant) throw new Error("Tenant not found");
    return await handler.addItem(parsed.cartId, {
      tenantId: parsed.tenantId,
      item: parsed.item,
    });
  };
}

function createRemoveItemService({
  handler,
  findTenantByIdService,
}: Pick<Dependencies, "handler" | "findTenantByIdService">) {
  return async (input: unknown) => {
    const schema = CartEntitySchema.pick({
      tenantId: true,
      cartId: true,
    }).extend({
      sku: CartItemSchema.shape.sku,
      quantity: CartItemSchema.shape.quantity,
    });
    const parsed = schema.parse(input);
    const tenant = await findTenantByIdService(parsed.tenantId);
    if (!tenant) throw new Error("Tenant not found");
    return await handler.removeItem(parsed.cartId, {
      tenantId: parsed.tenantId,
      sku: parsed.sku,
      quantity: parsed.quantity,
    });
  };
}

function createEmptyCartService({
  handler,
  findTenantByIdService,
}: Pick<Dependencies, "handler" | "findTenantByIdService">) {
  return async (input: unknown) => {
    const schema = CartEntitySchema.pick({ tenantId: true, cartId: true });
    const parsed = schema.parse(input);
    const tenant = await findTenantByIdService(parsed.tenantId);
    if (!tenant) throw new Error("Tenant not found");
    return await handler.empty(parsed.cartId, { tenantId: parsed.tenantId });
  };
}

function createCheckoutCartService({
  handler,
  findTenantByIdService,
}: Pick<Dependencies, "handler" | "findTenantByIdService">) {
  return async (input: unknown) => {
    const schema = CartEntitySchema.pick({
      tenantId: true,
      cartId: true,
    });
    const parsed = schema.parse(input);
    const tenant = await findTenantByIdService(parsed.tenantId);
    if (!tenant) throw new Error("Tenant not found");
    return await handler.checkout(parsed.cartId, {
      tenantId: parsed.tenantId,
    });
  };
}

function createCancelCartService({
  handler,
  findTenantByIdService,
}: Pick<Dependencies, "handler" | "findTenantByIdService">) {
  return async (input: unknown) => {
    const schema = CartEntitySchema.pick({
      tenantId: true,
      cartId: true,
    }).extend({
      reason: CartItemSchema.shape.name.min(1),
    });
    const parsed = schema.parse(input);
    const tenant = await findTenantByIdService(parsed.tenantId);
    if (!tenant) throw new Error("Tenant not found");
    return await handler.cancel(parsed.cartId, {
      tenantId: parsed.tenantId,
      reason: parsed.reason,
    });
  };
}

function createGetCartService({
  repository,
  findTenantByIdService,
}: Pick<Dependencies, "repository" | "findTenantByIdService">) {
  return async ({ tenantId, cartId }: { tenantId: string; cartId: string }) => {
    const tenant = await findTenantByIdService(tenantId);
    if (!tenant) throw new Error("Tenant not found");
    const cart = await repository.findById(tenantId, cartId);
    if (!cart) throw new Error("Cart not found");
    return cart;
  };
}

function createGetCartsService({
  repository,
  findTenantByIdService,
}: Pick<Dependencies, "repository" | "findTenantByIdService">) {
  return async ({ tenantId }: { tenantId: string }) => {
    const tenant = await findTenantByIdService(tenantId);
    if (!tenant) throw new Error("Tenant not found");
    return await repository.findByTenantId(tenantId);
  };
}

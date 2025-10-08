import type { TenantServiceAdapter } from "../../tenant/tenant.index.js";
import { CartEntitySchema, CartItemSchema } from "../domain/cart.entity.js";
import type { CartRepository } from "../repository/cart.repo.js";
import type { CartEventHandler } from "./event-sourcing/cart.event-handler.js";

type Dependencies = {
  handler: CartEventHandler;
  repository: CartRepository;
  findTenantByIdService: TenantServiceAdapter["get"];
};

type GetCart = ReturnType<typeof createGetCartService>;
export type CartService = ReturnType<typeof createCartServiceFactory>;

export function createCartServiceFactory(deps: Dependencies) {
  const get: GetCart = createGetCartService(deps);
  return {
    create: createCreateCartService(deps),
    addItem: createAddItemService({ get }, deps),
    removeItem: createRemoveItemService({ get }, deps),
    empty: createEmptyCartService({ get }, deps),
    checkout: createCheckoutCartService({ get }, deps),
    cancel: createCancelCartService({ get }, deps),
    get,
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

function createAddItemService(
  { get }: { get: GetCart },
  {
    handler,
    findTenantByIdService,
  }: Pick<Dependencies, "handler" | "findTenantByIdService">,
) {
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
    await get({ tenantId: parsed.tenantId, cartId: parsed.cartId });
    return await handler.addItem(parsed.cartId, {
      tenantId: parsed.tenantId,
      item: parsed.item,
    });
  };
}

function createRemoveItemService(
  { get }: { get: GetCart },
  {
    handler,
    findTenantByIdService,
  }: Pick<Dependencies, "handler" | "findTenantByIdService">,
) {
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
    await get({ tenantId: parsed.tenantId, cartId: parsed.cartId });
    return await handler.removeItem(parsed.cartId, {
      tenantId: parsed.tenantId,
      sku: parsed.sku,
      quantity: parsed.quantity,
    });
  };
}

function createEmptyCartService(
  { get }: { get: GetCart },
  {
    handler,
    findTenantByIdService,
  }: Pick<Dependencies, "handler" | "findTenantByIdService">,
) {
  return async (input: unknown) => {
    const schema = CartEntitySchema.pick({ tenantId: true, cartId: true });
    const parsed = schema.parse(input);
    const tenant = await findTenantByIdService(parsed.tenantId);
    if (!tenant) throw new Error("Tenant not found");
    await get({ tenantId: parsed.tenantId, cartId: parsed.cartId });
    return await handler.empty(parsed.cartId, { tenantId: parsed.tenantId });
  };
}

function createCheckoutCartService(
  { get }: { get: GetCart },
  {
    handler,
    findTenantByIdService,
  }: Pick<Dependencies, "handler" | "findTenantByIdService">,
) {
  return async (input: unknown) => {
    const schema = CartEntitySchema.pick({
      tenantId: true,
      cartId: true,
    }).extend({
      orderId: CartEntitySchema.shape.cartId,
      total: CartItemSchema.shape.unitPrice,
    });
    const parsed = schema.parse(input);
    const tenant = await findTenantByIdService(parsed.tenantId);
    if (!tenant) throw new Error("Tenant not found");
    await get({ tenantId: parsed.tenantId, cartId: parsed.cartId });
    return await handler.checkout(parsed.cartId, {
      tenantId: parsed.tenantId,
      orderId: parsed.orderId,
      total: parsed.total,
    });
  };
}

function createCancelCartService(
  { get }: { get: GetCart },
  {
    handler,
    findTenantByIdService,
  }: Pick<Dependencies, "handler" | "findTenantByIdService">,
) {
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
    await get({ tenantId: parsed.tenantId, cartId: parsed.cartId });
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

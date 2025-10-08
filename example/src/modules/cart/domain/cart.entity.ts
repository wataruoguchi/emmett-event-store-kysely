import { Schema } from "effect";

export const CartItemSchema = Schema.Struct({
  sku: Schema.String,
  name: Schema.String,
  unitPrice: Schema.Number.pipe(Schema.positive()),
  quantity: Schema.Number.pipe(Schema.int(), Schema.positive()),
});

export const CartEntitySchema = Schema.Struct({
  tenantId: Schema.String,
  cartId: Schema.UUID,
  currency: Schema.String,
  items: Schema.Array(CartItemSchema),
  isCheckedOut: Schema.Boolean,
  isCancelled: Schema.Boolean,
});

export type CartEntity = Schema.Schema.Type<typeof CartEntitySchema>;
export type CartItem = Schema.Schema.Type<typeof CartItemSchema>;

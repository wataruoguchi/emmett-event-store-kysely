import { z } from "zod";

export const CartItemSchema = z.object({
  sku: z.string(),
  name: z.string(),
  unitPrice: z.number().finite().nonnegative(),
  quantity: z.number().int().positive(),
});

export const CartEntitySchema = z.object({
  tenantId: z.string(),
  cartId: z.uuid(),
  currency: z.string(),
  items: z.array(CartItemSchema).default([]),
  isCheckedOut: z.boolean().default(false),
  isCancelled: z.boolean().default(false),
});

export type CartEntity = z.infer<typeof CartEntitySchema>;
export type CartItem = z.infer<typeof CartItemSchema>;

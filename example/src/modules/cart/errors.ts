export class CartNotFoundError extends Error {
  readonly _tag = "CartNotFoundError";
}

export class CartInvalidInputError extends Error {
  readonly _tag = "CartInvalidInputError";
}

export class TenantNotFoundError extends Error {
  readonly _tag = "TenantNotFoundError";
}

/**
 * Each module has one errors.ts file. All errors in the module are exported from here.
 */

export class TenantNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantNotFoundError";
  }
}

export class TenantInvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantInvalidInputError";
  }
}

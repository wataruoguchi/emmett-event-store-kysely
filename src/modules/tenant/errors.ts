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

export class GeneratorNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneratorNotFoundError";
  }
}

export class GeneratorAlreadyExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneratorAlreadyExistsError";
  }
}

export class GeneratorInvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneratorInvalidInputError";
  }
}

export class GeneratorTenantNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneratorTenantNotFoundError";
  }
}

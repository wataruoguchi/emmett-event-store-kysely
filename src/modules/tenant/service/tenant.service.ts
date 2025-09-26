export const findTenantByIdService = async (tenantId: string) => {
  return Promise.resolve({
    tenantId,
    name: "mock tenant",
  });
};

export class TenantNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantNotFoundError";
  }
}

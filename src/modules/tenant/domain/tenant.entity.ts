import { z } from "zod";

export const TenantEntitySchema = z.object({
  id: z.uuid(),
  tenantId: z.string(), // TODO: We want to deprecate tenant_id and use id instead.
  name: z.string(),
});

export type TenantEntity = z.infer<typeof TenantEntitySchema>;

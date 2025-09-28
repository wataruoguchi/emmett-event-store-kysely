import { z } from "zod";

export const TenantEntitySchema = z.object({
  id: z.uuid(),
  tenantId: z.string(),
  name: z.string(),
});

export type TenantEntity = z.infer<typeof TenantEntitySchema>;

import { Schema } from "effect";

export const TenantEntitySchema = Schema.Struct({
  id: Schema.UUID,
  tenantId: Schema.String, // TODO: We want to deprecate tenant_id and use id instead.
  name: Schema.String,
});

export type TenantEntity = Schema.Schema.Type<typeof TenantEntitySchema>;

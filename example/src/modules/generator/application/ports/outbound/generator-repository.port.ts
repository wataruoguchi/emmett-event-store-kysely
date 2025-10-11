/**
 * Outbound Port - Defines what the Generator module needs from read model persistence
 */

export interface GeneratorRepositoryPort {
  findById(
    tenantId: string,
    generatorId: string,
  ): Promise<GeneratorReadModel | undefined>;
  findByTenantId(tenantId: string): Promise<GeneratorReadModel[]>;
}

export type GeneratorReadModel = {
  tenant_id: string;
  generator_id: string;
  name: string;
  address: string | null;
  generator_type: string | null;
  notes: string | null;
  is_deleted: boolean;
  created: Date;
  updated: Date;
};

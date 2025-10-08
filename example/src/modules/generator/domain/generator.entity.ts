import { Schema } from "effect";

export const GeneratorEntitySchema = Schema.Struct({
  tenantId: Schema.String,
  generatorId: Schema.UUID,
  name: Schema.String,
  address: Schema.optional(Schema.String),
  generatorType: Schema.optional(
    Schema.Union(
      Schema.Literal("commercial"),
      Schema.Literal("residential"),
      Schema.Literal("industrial"),
      Schema.Literal("agricultural"),
      Schema.Literal("other"),
    ),
  ),
  notes: Schema.optional(Schema.String),
  isDeleted: Schema.optional(Schema.Boolean),
});

export type GeneratorEntity = Schema.Schema.Type<typeof GeneratorEntitySchema>;

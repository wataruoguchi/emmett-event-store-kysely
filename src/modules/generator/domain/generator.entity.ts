import { z } from "zod";

export const GeneratorEntitySchema = z.object({
  tenantId: z.string(),
  generatorId: z.string(),
  name: z.string(),
  address: z.string().optional(),
  generatorType: z
    .enum(["commercial", "residential", "industrial", "agricultural", "other"])
    .optional(),
  notes: z.string().optional(),
});

export type GeneratorEntity = z.infer<typeof GeneratorEntitySchema>;

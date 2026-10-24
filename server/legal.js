import { z } from "zod";

const configSchema = z.object({
  name: z.string().trim().max(250).default(""),
  identifier: z.string().trim().regex(/^(?:\d{12})?$/).default(""),
  address: z.string().trim().max(500).default(""),
  email: z.union([z.literal(""), z.email()]).default(""),
  storageCountry: z.string().trim().max(100).default(""),
});
// Public business details only: never expose the full environment.
export function legalDetails(env = process.env) {
  return configSchema.parse({
    name: env.IQLAND_LEGAL_NAME,
    identifier: env.IQLAND_LEGAL_ID,
    address: env.IQLAND_LEGAL_ADDRESS,
    email: env.IQLAND_PRIVACY_EMAIL,
    storageCountry: env.IQLAND_STORAGE_COUNTRY,
  });
}

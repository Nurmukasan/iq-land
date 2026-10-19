import maxmind from "maxmind";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import manifest from "./data/country-database.json" with { type: "json" };
import { languageForCountry } from "../shared/i18n/languages.js";
// Local country-only snapshot, verified against its official release digest.
// No visitor IP is sent to a geolocation service, and startup is offline.
const bytes = gunzipSync(
  readFileSync(new URL("./data/user-country.mmdb.gz", import.meta.url)),
  { maxOutputLength: 32 * 1024 * 1024 },
);
if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256)
  throw Error("Country database checksum mismatch");
const countries = new maxmind.Reader(bytes);
export function detectLanguage(ip, preferred = "") {
  const address = String(ip || "").replace(/^::ffff:/, "");
  const country = isIP(address)
    ? countries.get(address)?.country_code || null
    : null;
  return { language: languageForCountry(country, preferred), country };
}

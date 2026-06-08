import { Bundle } from "@trellis/schema";
import { Value } from "@sinclair/typebox/value";
import type { GateIssue } from "./types.js";

const G = "1-schema";

export function gateSchema(bundle: unknown): GateIssue[] {
  if (Value.Check(Bundle, bundle)) return [];
  return [...Value.Errors(Bundle, bundle)].map((e) => ({
    gate: G,
    level: "error" as const,
    message: `schema: ${e.path || "/"}: ${e.message}`,
  }));
}

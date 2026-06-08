import { type TSchema, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export interface SchemaError {
  path: string;
  message: string;
}

export type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: SchemaError[] };

export function validate<S extends TSchema>(
  schema: S,
  value: unknown,
): ValidateResult<Static<S>> {
  if (Value.Check(schema, value)) {
    return { ok: true, value: value as Static<S> };
  }
  const errors: SchemaError[] = [...Value.Errors(schema, value)].map((e) => ({
    path: e.path,
    message: e.message,
  }));
  return { ok: false, errors };
}

export function assertValid<S extends TSchema>(
  schema: S,
  value: unknown,
): Static<S> {
  const result = validate(schema, value);
  if (result.ok) return result.value;
  const detail = result.errors
    .map((e) => `${e.path || "/"}: ${e.message}`)
    .join("; ");
  throw new Error(`Schema validation failed: ${detail}`);
}

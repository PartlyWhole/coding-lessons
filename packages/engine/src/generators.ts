import type { GenSpec, ElemSpec, Json } from "@trellis/schema";
import type { Prng } from "./prng.js";

// A GenSpec is an ElemSpec plus a required `param`; genValue only reads the shared
// fields, so it accepts either. Bounded + total: every domain is finite and meaningful.
type AnySpec = ElemSpec | GenSpec;

export function genValue(spec: AnySpec, prng: Prng): Json {
  switch (spec.type) {
    case "int": {
      const lo = Math.ceil(spec.min ?? 0);
      const hi = Math.floor(spec.max ?? lo + 10);
      return prng.nextInt(lo, hi);
    }
    case "float": {
      const lo = spec.min ?? 0;
      const hi = spec.max ?? lo + 1;
      return lo + prng.nextFloat() * (hi - lo);
    }
    case "bool":
      return prng.nextU32() % 2 === 0;
    case "str": {
      const alphabet = spec.alphabet && spec.alphabet.length > 0 ? spec.alphabet : "abcdefghijklmnopqrstuvwxyz";
      const lo = Math.max(0, Math.ceil(spec.min ?? 0));
      const hi = Math.max(lo, Math.floor(spec.max ?? lo + 8));
      const len = prng.nextInt(lo, hi);
      let s = "";
      for (let i = 0; i < len; i++) s += alphabet.charAt(prng.nextInt(0, alphabet.length - 1));
      return s;
    }
    case "list": {
      const lo = Math.max(0, Math.ceil(spec.min ?? 0));
      const hi = Math.max(lo, Math.floor(spec.max ?? lo + 4));
      const len = prng.nextInt(lo, hi);
      const elem: AnySpec = spec.elem ?? { type: "int", min: 0, max: 9 };
      const out: Json[] = [];
      for (let i = 0; i < len; i++) out.push(genValue(elem, prng));
      return out;
    }
    case "choice": {
      const choices = spec.choices ?? [];
      if (choices.length === 0) throw new Error("choice generator has no choices");
      return prng.pick(choices);
    }
  }
}

// The argument tuple for entrypoint(*args): one value per generator, in order.
export function genArgs(generators: readonly GenSpec[], prng: Prng): Json[] {
  return generators.map((g) => genValue(g, prng));
}

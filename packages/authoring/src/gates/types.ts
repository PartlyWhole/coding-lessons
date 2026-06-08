export interface GateIssue {
  gate: string; // "1-schema" | "2-referential" | ...
  level: "error" | "warn";
  message: string;
}

export interface GateReport {
  ok: boolean; // false iff any error-level issue
  issues: GateIssue[];
  stats: { nodes: number; skills: number; misconceptions: number; cells: number };
}

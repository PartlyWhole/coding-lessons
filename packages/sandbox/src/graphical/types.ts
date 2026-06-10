// TEMP until the schema seam lands in this worktree's dependency graph — Task 9a swaps
// these for the @trellis/schema exports (`ScriptedFrame`, `GraphicalConfig`) and deletes
// this file. Shapes mirror packages/schema/src/evaluator.ts §17.4 exactly.
export interface ScriptedFrame {
  keysDown?: string[];
  mouse?: { x: number; y: number; buttons: number };
}

export interface GraphicalConfig {
  entrypoints: {
    init?: string;
    update: string;
    probe?: string;
  };
  inputTape: ScriptedFrame[];
  dt: number;
  frames: number;
}

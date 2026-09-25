/**
 * `@hashintel/brunch-agent` — the harness.
 *
 * Active authority: Brunch's named constants and the workpiece tools.
 * The retired YAML plugin definition, repertoire, and typed interpretation
 * machinery were removed on 2026-09-02. Consumerless suspended orchestration
 * is not part of the package surface.
 *
 * Everything that plain Node can load lives on this main export, including the
 * workpiece tools. The `./flue` subpath holds only what needs a Flue build: the
 * agent hook and the skill it mounts. Plugins follow the same split while
 * depending inward on this package. That direction
 * is enforced mechanically by
 * `apps/brunch-agent/test/architecture/import-direction.test.ts`.
 */

export * from "./constants";
export { type ToolExecution } from "./conversation/reply-protocol";
export { updateWorkpieceInputSchema } from "./update-workpiece";
export {
  createWorkpieceReadTool,
  updateWorkpieceOutputSchema,
  workpieceReadOutputSchema,
} from "./workpiece-tools";

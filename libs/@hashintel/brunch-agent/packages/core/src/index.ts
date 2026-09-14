/**
 * `@hashintel/brunch-agent` — the harness.
 *
 * Active authority: tool naming and the harness reply-event contract.
 * The retired YAML plugin definition, repertoire, and typed interpretation
 * machinery were removed on 2026-09-02. Consumerless suspended orchestration
 * is not part of the package surface.
 *
 * The substrate-neutral SDK remains on this main export. The `./flue` subpath
 * owns the production agent-runtime contribution; plugins may likewise expose
 * Flue-native resources while depending inward on this package. That direction
 * is enforced mechanically by
 * `apps/brunch-agent/test/architecture/import-direction.test.ts`.
 */

export {
  OPERATIONS,
  PRODUCT_NAME,
  toolName,
  toolPrefix,
  type Operation,
} from "./conversation/naming";
export {
  BRUNCH_QUESTION_DATA_NAME,
  BRUNCH_QUESTION_TOOL_NAME,
  BRUNCH_QUESTION_TOOL_NAMES,
  BrunchQuestionDataSchema,
  BrunchQuestionInputSchema,
  LEGACY_BRUNCH_QUESTION_TOOL_NAME,
  LEGACY_QUESTION_REPLAY_TOOL_NAME,
  parseBrunchQuestionData,
  type BrunchQuestionData,
} from "./question-marker";
export {
  type HarnessReplyEvent,
  type ReplyPartKind,
  type ToolExecution,
} from "./conversation/reply-protocol";

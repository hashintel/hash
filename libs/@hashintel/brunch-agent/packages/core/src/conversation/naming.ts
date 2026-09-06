/**
 * Tool namespacing (spec §12.3).
 *
 * Architectural strings name **identity, not function**. Every model-facing
 * tool is harness-owned, and its name is the product name applied to an
 * abstract operation — so the unresolved product name costs exactly one edit
 * here rather than a repo-wide rename. `elicit_*` is the anti-pattern: it
 * names what the tool does, which is the one thing the name must not fix.
 *
 * Core names operations abstractly; the binding renders substrate tool names
 * from them (spec §10, §4).
 */

/**
 * The product name.
 *
 * Settled as `brunch` (ADR-0001), which is a deliberate exception to the
 * spec's "nothing bakes 'brunch' into structure": the name-fog resolved in
 * favour of the working label rather than away from it. The rule that still
 * binds is the one about *function* — the prefix names who the tool belongs
 * to, never what it does, so `elicit_*` stays forbidden.
 *
 * Should the name ever move again, this constant is the only line that
 * changes; everything model-facing derives from it.
 */
export const PRODUCT_NAME = "brunch";

/**
 * The abstract operations core names. The binding renders each into its
 * substrate's tool namespace; nothing here knows Flue's dialect.
 *
 * Milestone one grows this list one slice at a time. `ask` proves suspension;
 * `sweep` proves the first durable session-to-document transition.
 */
export const OPERATIONS = ["ask", "sweep"] as const;

export type Operation = (typeof OPERATIONS)[number];
export type ToolName<OperationName extends Operation = Operation> =
  `${typeof PRODUCT_NAME}_${OperationName}`;

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

/**
 * Derive the tool-name prefix from a product name: lowercased, stripped to
 * alphanumerics, terminated with `_`.
 *
 * Refuses rather than silently emptying — a nameless prefix would collide with
 * the substrate's reserved tool names (spec §10, recorded Flue facts).
 */
export function toolPrefix(productName: string = PRODUCT_NAME): string {
  const normalized = productName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!/^[a-z][a-z0-9]*$/.test(normalized)) {
    throw new Error(
      `Unusable product name ${JSON.stringify(productName)}: a tool prefix must normalize to alphanumerics starting with a letter.`,
    );
  }
  return `${normalized}_`;
}

/**
 * Render an abstract operation into its model-facing tool name.
 *
 * The parameter is the `Operation` union, not `string`, so a misspelled
 * operation is a compile error rather than a misnamed tool the model quietly
 * fails to find. The runtime guard stays for untyped callers.
 */
export function toolName<OperationName extends Operation>(
  operation: OperationName,
): ToolName<OperationName>;
export function toolName(operation: Operation, productName: string): string;
export function toolName(
  operation: Operation,
  productName: string = PRODUCT_NAME,
): string {
  if (!IDENTIFIER.test(operation)) {
    throw new Error(
      `Unusable operation name ${JSON.stringify(operation)}: expected a lowercase identifier.`,
    );
  }
  return `${toolPrefix(productName)}${operation}`;
}

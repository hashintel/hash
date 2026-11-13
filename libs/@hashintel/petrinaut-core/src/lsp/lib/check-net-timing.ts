import type { Transition } from "../../types/sdcpn";
import type ts from "@typescript/typescript6";

/** TS `DiagnosticCategory.Error`, numeric: `typescript` is imported type-only here. */
export const TS_CATEGORY_ERROR = 1;

/**
 * Code of the diagnostic on a predicate with no input place in a timed net.
 * Above the range the HIR diagnostics take.
 */
export const SOURCE_PREDICATE_IN_TIMED_NET_CODE = 99200;

/**
 * The diagnostic on a predicate with no input place in a timed net.
 *
 * A predicate fires as soon as it holds. With no input place nothing ever
 * takes that away, so in a timed net it would fire without end at one
 * instant. An untimed net has no instant to stall at: such a transition
 * fires once per step there, and is allowed.
 *
 * The diagnostic sits on the first line of the firing code: the problem is
 * the transition's shape, and that line is where its kind shows.
 */
export const sourcePredicateDiagnostic = (
  transition: Pick<Transition, "name">,
  lambdaCode: string,
): ts.Diagnostic => {
  const firstLineEnd = lambdaCode.indexOf("\n");
  return {
    file: undefined,
    start: 0,
    length: firstLineEnd === -1 ? lambdaCode.length : firstLineEnd,
    messageText: `Predicate \`${transition.name}\` has no input place. In a timed net nothing ever disables it, so it would fire without end at one instant. Connect an input place, or give it a stochastic rate.`,
    category: TS_CATEGORY_ERROR,
    code: SOURCE_PREDICATE_IN_TIMED_NET_CODE,
    source: "net",
  };
};

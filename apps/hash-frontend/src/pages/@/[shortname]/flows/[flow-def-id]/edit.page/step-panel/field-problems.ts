import type { FlowDefinitionDiagnosticWithStepId } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

type Problem = FlowDefinitionDiagnosticWithStepId;

/**
 * The input a step's problem is about, from its path, and where in the input's source it is, e.g. `query` and
 * `["payload", "value", "limit"]` for `["steps", 2, "inputs", "query", "payload", "value", "limit"]`.
 */
const getInputPath = ({ path }: Problem) => {
  /* The step is the innermost one on the path: the last number after "steps". */
  const stepIndex = path.findLastIndex(
    (segment, index) =>
      typeof segment === "number" && path[index - 1] === "steps",
  );
  const [section, inputName, ...pathInSource] = path.slice(stepIndex + 1);

  return section === "inputs" && typeof inputName === "string"
    ? { inputName, pathInSource }
    : undefined;
};

/** `[]` when the problem is about the whole input. */
export const getPathInSource = (problem: Problem) =>
  getInputPath(problem)?.pathInSource ?? [];

/**
 * Splits a step's problems into those about each of `inputNames`, shown next to its field, and the rest, which are
 * about the step as a whole or an input it doesn't show.
 */
export const getFieldProblems = (
  problems: Problem[],
  inputNames: string[],
): { byInputName: Map<string, Problem[]>; stepProblems: Problem[] } => {
  const byInputName = new Map<string, Problem[]>();
  const stepProblems: Problem[] = [];

  for (const problem of problems) {
    const inputName = getInputPath(problem)?.inputName;

    if (inputName === undefined || !inputNames.includes(inputName)) {
      stepProblems.push(problem);
    } else {
      byInputName.set(inputName, [
        ...(byInputName.get(inputName) ?? []),
        problem,
      ]);
    }
  }

  return { byInputName, stepProblems };
};

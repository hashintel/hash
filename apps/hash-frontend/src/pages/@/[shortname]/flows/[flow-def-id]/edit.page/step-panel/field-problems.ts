import type { FlowDefinitionDiagnosticWithStepId } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

type Problem = FlowDefinitionDiagnosticWithStepId;

/** A problem's path within the step it's in: the innermost step on the path, the last number after "steps". */
const getPathInStep = ({ path }: Problem) =>
  path.slice(
    path.findLastIndex(
      (segment, index) =>
        typeof segment === "number" && path[index - 1] === "steps",
    ) + 1,
  );

/**
 * The input a step's problem is about, from its path, and where in the input's source it is, e.g. `query` and
 * `["payload", "value", "limit"]` for `["steps", 2, "inputs", "query", "payload", "value", "limit"]`.
 */
const getInputPath = (problem: Problem) => {
  const [section, inputName, ...pathInSource] = getPathInStep(problem);

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

/** Splits a for-each step's problems into those about its list, those about what it collects, and the rest. */
export const getForEachFieldProblems = (problems: Problem[]) => {
  const inSection = (section: string) =>
    problems.filter((problem) => getPathInStep(problem)[0] === section);
  const listProblems = inSection("over");
  const collectProblems = inSection("collect");

  return {
    listProblems,
    collectProblems,
    stepProblems: problems.filter(
      (problem) =>
        !listProblems.includes(problem) && !collectProblems.includes(problem),
    ),
  };
};

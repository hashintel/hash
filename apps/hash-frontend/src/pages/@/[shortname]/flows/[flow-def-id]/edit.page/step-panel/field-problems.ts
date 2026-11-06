import type { FlowDefinitionDiagnosticWithStepId } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

type Problem = FlowDefinitionDiagnosticWithStepId;

/** The name of the input a step's problem is about, from its path, e.g. `dataToWrite` for `["steps", 2, "inputs", "dataToWrite"]`. */
const getInputName = ({ path }: Problem) => {
  /* The step is the innermost one on the path: the last number after "steps". */
  const stepIndex = path.findLastIndex(
    (segment, index) =>
      typeof segment === "number" && path[index - 1] === "steps",
  );
  const [section, inputName] = path.slice(stepIndex + 1);

  return section === "inputs" && typeof inputName === "string"
    ? inputName
    : undefined;
};

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
    const inputName = getInputName(problem);

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

import type {
  ArcEndpoint,
  Color,
  ColorElementType,
  Transition,
} from "@hashintel/petrinaut-core";

/**
 * What a transition's kernel needs to know about an arc's place: the name kernels address it by, and its colour.
 */
export type KernelPlace = { name: string; color: Color };

const defaultValues: Record<ColorElementType, string> = {
  boolean: "false",
  integer: "0",
  real: "0",
  string: '""',
  uuid: '""',
};

const elementDefaults: Record<string, string> = {
  /* A value produced by a step is present unless the executor says otherwise. */
  present: "true",
};

/**
 * Adds a kernel to a transition, producing one token per output arc (every flow-net arc has weight 1).
 *
 * Each output token copies the attributes it shares with the transition's first input token – at least
 * `run_id` and `item_path`, so tokens stay correlated with their run and item – and gives the rest default
 * values. A token for an input port nothing feeds (`isAbsent`) has `present` false. The executor, rather than these kernels, decides the values that matter (references, counts), so the
 * kernels exist to make the net well-formed and simulatable.
 */
export const withKernel = (
  transition: Transition,
  resolvePlace: (endpoint: ArcEndpoint) => KernelPlace,
  isAbsent: (endpoint: ArcEndpoint) => boolean = () => false,
): Transition => {
  const [firstInputArc] = transition.inputArcs;

  const source = firstInputArc?.endpoint
    ? resolvePlace(firstInputArc.endpoint)
    : null;

  const sourceElementNames = new Set(
    source?.color.elements.map(({ name }) => name) ?? [],
  );

  const tokenFor = ({ color }: KernelPlace, absent: boolean) =>
    `{ ${color.elements
      .map(({ name, type }) => {
        const value =
          absent && name === "present"
            ? "false"
            : sourceElementNames.has(name)
              ? `source.${name}`
              : (elementDefaults[name] ?? defaultValues[type]);

        return `${name}: ${value}`;
      })
      .join(", ")} }`;

  const outputs = transition.outputArcs.flatMap(({ endpoint }) =>
    endpoint
      ? [{ place: resolvePlace(endpoint), absent: isAbsent(endpoint) }]
      : [],
  );

  const lines = [
    ...(source
      ? [`const source = input[${JSON.stringify(source.name)}][0];`]
      : []),
    "return {",
    ...outputs.map(
      ({ place, absent }) =>
        `  ${JSON.stringify(place.name)}: [${tokenFor(place, absent)}],`,
    ),
    "};",
  ];

  return { ...transition, transitionKernelCode: lines.join("\n") };
};

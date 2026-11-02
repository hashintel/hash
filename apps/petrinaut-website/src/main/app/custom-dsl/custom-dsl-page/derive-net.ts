import {
  calculateGraphLayout,
  layoutNodeDimensions,
  mergeDslDocument,
  parsePetrinautDsl,
  type DslDiagnostic,
  type SDCPN,
  type Subnet,
} from "@hashintel/petrinaut-core";

export const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

export type DerivedNet = {
  /** The net the text describes, `null` while a line fails to parse or a reference to resolve. */
  net: SDCPN | null;
  /** The title on the `net` line, `null` when the line has none. */
  title: string | null;
  diagnostics: readonly DslDiagnostic[];
};

type Layout = typeof calculateGraphLayout;

type Scope = Pick<SDCPN, "places" | "transitions" | "componentInstances">;

const nodesOf = (scope: Scope) => [
  ...scope.places,
  ...scope.transitions,
  ...(scope.componentInstances ?? []),
];

const hasNewNode = (scope: Scope, before: Scope | undefined): boolean => {
  const known = new Set(before ? nodesOf(before).map(({ id }) => id) : []);
  return nodesOf(scope).some(({ id }) => !known.has(id));
};

/** Every node of `scope` takes the position the layout gives it. */
const layOut = async (scope: SDCPN | Subnet, layout: Layout): Promise<void> => {
  const positions = await layout(scope, layoutNodeDimensions);
  for (const node of nodesOf(scope)) {
    const next = positions[node.id];
    if (next) {
      node.x = next.x;
      node.y = next.y;
    }
  }
};

/**
 * The net `text` describes, written onto `previous` so that what the text
 * keeps keeps its id and its position. The text carries no positions, so a
 * scope with a node it did not have before, the root or a component, is
 * laid out whole.
 */
export const deriveNet = async (
  previous: SDCPN,
  text: string,
  { layout = calculateGraphLayout }: { layout?: Layout } = {},
): Promise<DerivedNet> => {
  const parsed = parsePetrinautDsl(text);
  const { title } = parsed.document;
  if (parsed.diagnostics.some(({ severity }) => severity === "error")) {
    return { net: null, title, diagnostics: parsed.diagnostics };
  }
  const merged = mergeDslDocument(previous, parsed.document);
  const diagnostics = [...parsed.diagnostics, ...merged.diagnostics];
  if (!merged.ok) {
    return { net: null, title, diagnostics };
  }
  const net = merged.sdcpn;
  const scopes: Array<[SDCPN | Subnet, Scope | undefined]> = [
    [net, previous],
    ...(net.subnets ?? []).map((subnet): [Subnet, Subnet | undefined] => [
      subnet,
      previous.subnets?.find(({ id }) => id === subnet.id),
    ]),
  ];
  await Promise.all(
    scopes
      .filter(([scope, before]) => hasNewNode(scope, before))
      .map(([scope]) => layOut(scope, layout)),
  );
  return { net, title, diagnostics };
};

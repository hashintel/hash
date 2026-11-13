/**
 * Components a host provides: signatures a user can instantiate, with no net
 * behind them. A provided component is ports and parameters and nothing
 * else, so in a document it can only be an interface (see `interfaces.ts`);
 * what stands behind it is the host's business. The document takes a copy of
 * that interface the first time the component is instantiated, so it reads
 * the same without its host.
 */

import { toPetrinautId } from "../petrinaut-id";
import { subnetSchema } from "../schemas/entity-schemas";

import type {
  Color,
  ColorElementType,
  ID,
  Parameter,
  PortDirection,
  SDCPN,
  Subnet,
} from "../types/sdcpn";
import type { ImplementationBinding } from "./interfaces";

/** The tokens a provided port carries. Ports with the same elements can be fused. */
export type ProvidedTokenType = {
  name: string;
  /** CSS colour of the ports that carry these tokens. */
  displayColor: string;
  elements: readonly { name: string; type: ColorElementType }[];
};

export type ProvidedPort = {
  /** Unique within the component, and a valid place name. */
  name: string;
  direction: PortDirection;
  /** Absent, the port carries plain tokens. */
  tokenType?: ProvidedTokenType;
};

export type ProvidedParameter = Pick<
  Parameter,
  "name" | "variableName" | "type" | "defaultValue"
>;

export type ProvidedComponent = {
  /**
   * Names the component in every document that uses it, so it must stay the
   * same across sessions. Any string: `providedComponentSubnetId` gives the
   * id the document holds.
   */
  id: string;
  name: string;
  description?: string;
  /** SVG markup, drawn as an image in one colour. */
  iconSvg?: string;
  /** CSS colour of the icon and its tile. */
  displayColor?: string;
  ports: readonly ProvidedPort[];
  parameters?: readonly ProvidedParameter[];
};

/** The id of the interface a provided component is in a document. */
export const providedComponentSubnetId = (
  component: Pick<ProvidedComponent, "id">,
): ID => toPetrinautId(component.id);

/**
 * The interfaces of the components a host provides, by the id each has in a
 * document. Resolved once, when the host hands its components over.
 */
export type ProvidedInterfaces = ReadonlyMap<ID, Subnet>;

/** What no host, or a host that provides nothing, gives. */
export const noProvidedInterfaces: ProvidedInterfaces = new Map();

const assertNamedOnce = (
  component: ProvidedComponent,
  what: string,
  names: readonly string[],
): void => {
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated !== undefined) {
    throw new Error(
      `Provided component \`${component.name}\` has two ${what} named \`${repeated}\`.`,
    );
  }
};

/**
 * The interface a provided component is in a document. Every id inside it
 * derives from the component's id and the item's own name, so the same
 * component always gives the same interface, and two components may both
 * name a port `In`. Throws when two items of one kind share a name, since
 * they would share an id.
 */
/** Whether two declarations of a token type say the same, element by element. */
const sameTokenType = (
  first: ProvidedTokenType,
  second: ProvidedTokenType,
): boolean =>
  first.displayColor === second.displayColor &&
  first.elements.length === second.elements.length &&
  first.elements.every((element, index) => {
    const other = second.elements[index];
    return element.name === other?.name && element.type === other.type;
  });

export const toInterface = (component: ProvidedComponent): Subnet => {
  const scoped = (kind: string, name: string): ID =>
    toPetrinautId(`${component.id}/${kind}/${name}`);

  assertNamedOnce(
    component,
    "ports",
    component.ports.map(({ name }) => name),
  );
  assertNamedOnce(
    component,
    "parameters",
    (component.parameters ?? []).map(({ variableName }) => variableName),
  );

  const tokenTypes = new Map<string, ProvidedTokenType>();
  for (const { tokenType } of component.ports) {
    if (!tokenType) {
      continue;
    }
    const declared = tokenTypes.get(tokenType.name);
    if (declared && !sameTokenType(declared, tokenType)) {
      throw new Error(
        `Provided component \`${component.name}\` declares the token type \`${tokenType.name}\` in two ways.`,
      );
    }
    assertNamedOnce(
      component,
      `elements of \`${tokenType.name}\``,
      tokenType.elements.map(({ name }) => name),
    );
    tokenTypes.set(tokenType.name, tokenType);
  }

  return {
    id: providedComponentSubnetId(component),
    name: component.name,
    ...(component.description === undefined
      ? {}
      : { description: component.description }),
    ...(component.iconSvg === undefined ? {} : { iconSvg: component.iconSvg }),
    ...(component.displayColor === undefined
      ? {}
      : { displayColor: component.displayColor }),
    interface: true,
    places: component.ports.map((port, index) => ({
      id: scoped("port", port.name),
      name: port.name,
      colorId: port.tokenType ? scoped("type", port.tokenType.name) : null,
      dynamicsEnabled: false,
      isPort: true,
      portDirection: port.direction,
      x: 0,
      y: index * 100,
    })),
    transitions: [],
    types: [...tokenTypes.values()].map((tokenType): Color => ({
      id: scoped("type", tokenType.name),
      name: tokenType.name,
      iconSlug: "circle",
      displayColor: tokenType.displayColor,
      elements: tokenType.elements.map((element) => ({
        elementId: scoped(`type/${tokenType.name}`, element.name),
        name: element.name,
        type: element.type,
      })),
    })),
    differentialEquations: [],
    parameters: (component.parameters ?? []).map((parameter) => ({
      ...parameter,
      id: scoped("parameter", parameter.variableName),
    })),
  };
};

/**
 * The interface of each component, by its id in a document. Throws unless
 * every component gives an interface a document accepts, under an id no
 * other component has.
 */
export const resolveProvidedComponents = (
  components: readonly ProvidedComponent[],
): ProvidedInterfaces => {
  const interfaces = new Map<ID, Subnet>();
  for (const component of components) {
    const subnet = subnetSchema.parse(toInterface(component));
    if (interfaces.has(subnet.id)) {
      throw new Error(
        `Two provided components share the id \`${component.id}\`.`,
      );
    }
    interfaces.set(subnet.id, subnet);
  }
  return interfaces;
};

/**
 * Every subnet an instance can point at: the document's own, then each
 * provided interface the document has no copy of yet.
 */
export const instantiableSubnets = (
  sdcpn: Pick<SDCPN, "subnets">,
  provided: ProvidedInterfaces,
): Subnet[] => {
  const subnets = sdcpn.subnets ?? [];
  return [
    ...subnets,
    ...[...provided.values()].filter(
      (subnet) => !subnets.some(({ id }) => id === subnet.id),
    ),
  ];
};

/**
 * Puts the provided interface `subnetId` names into the document, unless the
 * document already holds a subnet under that id. Does nothing when no
 * provided component has that id.
 */
export const ensureProvidedComponent = (
  sdcpn: SDCPN,
  provided: ProvidedInterfaces,
  subnetId: ID,
): void => {
  const subnet = provided.get(subnetId);
  if (subnet && !(sdcpn.subnets ?? []).some(({ id }) => id === subnetId)) {
    const document = sdcpn;
    document.subnets ??= [];
    // Parsed again for a copy of its own: the document's is its to keep.
    document.subnets.push(subnetSchema.parse(subnet));
  }
};

/**
 * Whether an instance has nothing bound because what runs for it is the
 * host's business: its interface is one the host provides, and the document
 * binds no implementation to it.
 */
export const runsAtHost = (
  binding: ImplementationBinding | null,
  provided: ProvidedInterfaces,
): boolean =>
  binding?.kind === "unbound" &&
  binding.reason === "no-binding" &&
  provided.has(binding.interface.id);

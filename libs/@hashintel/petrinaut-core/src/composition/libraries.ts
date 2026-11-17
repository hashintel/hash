/**
 * Libraries: what a host hands over for an import of a document. A library
 * lists components under ids of its own, each with ports and parameters and,
 * when it runs, a body. A component without a body is an interface (see
 * `interfaces.ts`). A library is checked once, when it arrives, and each of
 * its components is read from then on as a subnet, the shape a document's own
 * components have, so every reader takes both the same way.
 */

import { z } from "zod";

import { toPetrinautId } from "../petrinaut-id";
import { subnetSchema } from "../schemas/entity-schemas";
import { COLOR_ELEMENT_TYPES } from "../simulation/engine/type-policies";
import { colorsStructurallyEqual } from "./fusions";
import { portDirections } from "./ports";

import type {
  Color,
  ColorElementType,
  DifferentialEquation,
  Parameter,
  Place,
  PortDirection,
  Subnet,
  Transition,
} from "../types/sdcpn";

/** The tokens a port carries. Ports with the same elements can be fused. */
export type LibraryTokenType = {
  name: string;
  /** CSS colour of the ports that carry these tokens. */
  displayColor: string;
  elements: { name: string; type: ColorElementType }[];
};

export type LibraryPort = {
  /**
   * Unique among the component's ports, and the same from one version of the
   * library to the next: documents name the port by it. For a component with
   * a body, the id of the place of the body the port is.
   */
  id: string;
  /** A place name. For a component with a body, the name of that place. */
  name: string;
  /** Absent, the direction is read off the body's arcs. */
  direction?: PortDirection;
  /** Absent, the port carries plain tokens. */
  tokenType?: LibraryTokenType;
};

/** A parameter, under an id documents key an instance's values by. */
export type LibraryParameter = Parameter;

/**
 * What a component runs, as a subnet of a document holds its own content.
 * The places `ports` name are its ports, whatever the places themselves say.
 */
export type LibraryComponentBody = {
  places: Place[];
  transitions: Transition[];
  types?: Color[];
  differentialEquations?: DifferentialEquation[];
};

export type LibraryComponent = {
  /**
   * Unique in the library, and the same from one version of the library to
   * the next: documents name the component by it.
   */
  id: string;
  name: string;
  description?: string;
  /** SVG markup, drawn as an image in one colour. */
  iconSvg?: string;
  /** CSS colour of the icon and its tile. */
  displayColor?: string;
  ports: LibraryPort[];
  parameters?: LibraryParameter[];
  /**
   * Absent, the component is an interface: an instance of it runs the
   * implementation bound to it.
   */
  body?: LibraryComponentBody;
};

export type Library = {
  /** The id documents import the library by. */
  id: string;
  name: string;
  components: LibraryComponent[];
};

/**
 * A library that passed its checks. Each component is a subnet whose `id` is
 * the component's id in the library, as written. Every id inside it is a
 * Petrinaut id, converted as a document converts the ids it loads, so a port
 * or a parameter is named in a document by `toPetrinautId` of its id here.
 */
export type ResolvedLibrary = {
  id: string;
  name: string;
  components: Subnet[];
};

/** The libraries that resolved, by the id of their import. */
export type ResolvedLibraries = ReadonlyMap<string, ResolvedLibrary>;

const identified = z.looseObject({ id: z.string().min(1), name: z.string() });

const tokenTypeSchema = z.strictObject({
  name: z.string().min(1),
  displayColor: z.string().min(1),
  elements: z.array(
    z.strictObject({
      name: z.string().min(1),
      type: z.enum(COLOR_ELEMENT_TYPES),
    }),
  ),
});

const portSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  direction: z.enum(portDirections).optional(),
  tokenType: tokenTypeSchema.optional(),
});

/**
 * The outline of a library: enough to name what is wrong with it. What a
 * component holds is checked as a subnet, once it is one.
 */
const librarySchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  components: z.array(
    z.strictObject({
      id: z.string().min(1),
      name: z.string(),
      description: z.string().optional(),
      iconSvg: z.string().optional(),
      displayColor: z.string().optional(),
      ports: z.array(portSchema),
      parameters: z.array(identified).optional(),
      body: z
        .strictObject({
          places: z.array(z.unknown()),
          transitions: z.array(z.unknown()),
          types: z.array(z.unknown()).optional(),
          differentialEquations: z.array(z.unknown()).optional(),
        })
        .optional(),
    }),
  ),
});

type LibraryOutline = z.output<typeof librarySchema>;
type ComponentOutline = LibraryOutline["components"][number];
type PortOutline = ComponentOutline["ports"][number];

const describeIssues = (error: z.ZodError): string =>
  error.issues
    .map(({ path, message }) =>
      path.length > 0 ? `${path.join(".")}: ${message}` : message,
    )
    .join("; ");

/** Throws when two of `items` share an id, naming the pair. */
const assertDistinctIds = (
  items: readonly { id: string; name: string }[],
  what: string,
  owner: string,
): void => {
  const namesById = new Map<string, string>();
  for (const { id, name } of items) {
    // As a document reads ids: two spellings of one UUID are one id.
    const key = toPetrinautId(id);
    const earlier = namesById.get(key);
    if (earlier !== undefined) {
      throw new Error(
        `${owner} has two ${what} with the id \`${id}\`: \`${earlier}\` and \`${name}\`.`,
      );
    }
    namesById.set(key, name);
  }
};

/**
 * The token types the ports of a component without a body declare, one per
 * name, and the type of each port. Throws when one name is declared in two
 * ways.
 */
const declaredTypes = (
  component: ComponentOutline,
  owner: string,
): { types: Color[]; typeIdOf: (port: PortOutline) => string | null } => {
  const typesByName = new Map<string, Color>();
  for (const { id, tokenType } of component.ports) {
    if (!tokenType) {
      continue;
    }
    const declared = typesByName.get(tokenType.name);
    if (declared && !colorsStructurallyEqual(declared, tokenType)) {
      throw new Error(
        `${owner} declares the token type \`${tokenType.name}\` in two ways.`,
      );
    }
    // A library gives a type no id: it takes one from the first port to
    // carry it, so the same library always resolves to the same subnet.
    const seed = `${component.id}/${id}/type`;
    typesByName.set(
      tokenType.name,
      declared ?? {
        id: toPetrinautId(seed),
        name: tokenType.name,
        iconSlug: "circle",
        displayColor: tokenType.displayColor,
        elements: tokenType.elements.map((element, index) => ({
          elementId: toPetrinautId(`${seed}/${index}`),
          ...element,
        })),
      },
    );
  }
  return {
    types: [...typesByName.values()],
    typeIdOf: ({ tokenType }) =>
      tokenType ? (typesByName.get(tokenType.name)?.id ?? null) : null,
  };
};

/**
 * The places of a body with the ones `ports` name marked as its ports, and
 * no other. Throws when a port names no place, or a place under another name
 * or of another token type: the list of ports is what a reader of the library
 * goes by.
 */
const markPorts = (
  body: Subnet,
  ports: readonly PortOutline[],
  owner: string,
): Place[] => {
  const portsById = new Map(
    ports.map((port) => [toPetrinautId(port.id), port]),
  );
  for (const [id, port] of portsById) {
    const place = body.places.find((candidate) => candidate.id === id);
    if (!place) {
      throw new Error(
        `Port \`${port.name}\` of ${owner} names the place \`${port.id}\`, which its body does not have.`,
      );
    }
    if (place.name !== port.name) {
      throw new Error(
        `Port \`${port.name}\` of ${owner} names a place of its body that is called \`${place.name}\`: the two names must be the same.`,
      );
    }
    const placeType = body.types.find(
      ({ id: typeId }) => typeId === place.colorId,
    );
    if (!colorsStructurallyEqual(port.tokenType, placeType)) {
      throw new Error(
        `Port \`${port.name}\` of ${owner} declares another token type than the place of its body holds.`,
      );
    }
  }
  return body.places.map(
    ({ isPort: _isPort, portDirection: ownDirection, ...place }) => {
      const port = portsById.get(place.id);
      const direction = port?.direction ?? ownDirection;
      return port
        ? {
            ...place,
            isPort: true,
            ...(direction === undefined ? {} : { portDirection: direction }),
          }
        : place;
    },
  );
};

/** A component of a library as a subnet. Throws on one a document would not accept. */
const toSubnet = (component: ComponentOutline, libraryId: string): Subnet => {
  const owner = `component \`${component.name}\` of library \`${libraryId}\``;
  assertDistinctIds(component.ports, "ports", `The ${owner}`);
  assertDistinctIds(component.parameters ?? [], "parameters", `The ${owner}`);

  const { body } = component;
  const { types, typeIdOf } = declaredTypes(component, `The ${owner}`);
  const parsed = subnetSchema.safeParse({
    id: component.id,
    name: component.name,
    description: component.description,
    iconSvg: component.iconSvg,
    displayColor: component.displayColor,
    parameters: component.parameters ?? [],
    ...(body
      ? {
          places: body.places,
          transitions: body.transitions,
          types: body.types ?? [],
          differentialEquations: body.differentialEquations ?? [],
        }
      : {
          interface: true,
          places: component.ports.map((port, index) => ({
            id: port.id,
            name: port.name,
            colorId: typeIdOf(port),
            dynamicsEnabled: false,
            isPort: true,
            portDirection: port.direction,
            // A place needs a position: nothing opens a component of a
            // library to show these.
            x: 0,
            y: index * 100,
          })),
          transitions: [],
          types,
          differentialEquations: [],
        }),
  });
  if (!parsed.success) {
    throw new Error(
      `The ${owner} is not valid: ${describeIssues(parsed.error)}`,
    );
  }
  const subnet: Subnet = { ...parsed.data, id: component.id };
  return body
    ? { ...subnet, places: markPorts(subnet, component.ports, `the ${owner}`) }
    : subnet;
};

/**
 * Checks what a host resolved the import `importId` to, and gives each of its
 * components as a subnet. Throws, in a sentence a user can read, on a library
 * under another id, on two components, two ports or two parameters that share
 * an id, and on a component a document would not accept as a subnet.
 */
export const resolveLibrary = (
  importId: string,
  library: unknown,
): ResolvedLibrary => {
  const outline = librarySchema.safeParse(library);
  if (!outline.success) {
    throw new Error(
      `The library \`${importId}\` is not valid: ${describeIssues(outline.error)}`,
    );
  }
  const { id, name, components } = outline.data;
  if (id !== importId) {
    throw new Error(
      `The library resolved for \`${importId}\` has the id \`${id}\`.`,
    );
  }
  assertDistinctIds(components, "components", `The library \`${id}\``);
  return {
    id,
    name,
    components: components.map((component) => toSubnet(component, id)),
  };
};

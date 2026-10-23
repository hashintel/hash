/**
 * @layerRoot core.dsl
 * @role The Petrinaut DSL: a textual projection of a document, with the components it composes written inline
 *
 * The printer walks a document and writes one declaration per entity, in
 * dependency order, with each code surface as a TypeScript function body
 * between braces. It records the lines each entity occupies, so an editor
 * can reveal the text of a selected item.
 */

import { getArcEndpoint } from "../arc-endpoints";
import { effectivePortDirection } from "../composition/ports";
import { dedentLines, toBodyForm } from "./code-bodies";
import { dslName } from "./identifiers";

import type {
  ArcEndpoint,
  Color,
  DifferentialEquation,
  Fusion,
  InputArc,
  Metric,
  OutputArc,
  Parameter,
  Place,
  Scenario,
  SDCPN,
  Subnet,
  Transition,
} from "../types/sdcpn";
import type { DslCodeKeyword } from "./keywords";

export type DslSpanKind =
  | "net"
  | "subnet"
  | "type"
  | "parameter"
  | "differentialEquation"
  | "place"
  | "transition"
  | "componentInstance"
  | "fusion"
  | "metric"
  | "scenario";

/** The lines an entity's declaration occupies, 1-based and inclusive. */
export type DslSpan = {
  kind: DslSpanKind;
  id: string;
  /** The subnet the entity belongs to, `null` at the root. */
  subnetId: string | null;
  startLine: number;
  endLine: number;
};

export type DslPrintResult = {
  text: string;
  spans: DslSpan[];
};

/** A body no longer than this prints on the keyword's line. */
const inlineBodyLength = 64;

class Writer {
  readonly lines: string[] = [];
  readonly spans: DslSpan[] = [];
  private depth = 0;

  line(text: string): void {
    this.lines.push(text === "" ? "" : `${"  ".repeat(this.depth)}${text}`);
  }

  blank(): void {
    if (this.lines.length > 0 && this.lines.at(-1) !== "") {
      this.lines.push("");
    }
  }

  indented(write: () => void): void {
    this.depth += 1;
    write();
    this.depth -= 1;
  }

  span(
    kind: DslSpanKind,
    id: string,
    subnetId: string | null,
    write: () => void,
  ): void {
    const startLine = this.lines.length + 1;
    write();
    this.spans.push({
      kind,
      id,
      subnetId,
      startLine,
      endLine: this.lines.length,
    });
  }

  /** `/// ` lines for a description. */
  doc(description: string | undefined): void {
    if (description === undefined || description.trim() === "") {
      return;
    }
    for (const line of description.trim().split(/\r?\n/u)) {
      this.line(line === "" ? "///" : `/// ${line}`);
    }
  }

  /**
   * A code block: `head` (the keyword by default) and the body, on one line
   * when short, else indented between braces. `keyword` names the surface
   * whose ambient inputs a module-form body is unwrapped against.
   */
  code(keyword: DslCodeKeyword, code: string, head: string = keyword): void {
    const lines = dedentLines(toBodyForm(code, keyword));
    if (lines.length === 0) {
      this.line(`${head} {}`);
      return;
    }
    if (lines.length === 1 && lines[0]!.length <= inlineBodyLength) {
      this.line(`${head} { ${lines[0]} }`);
      return;
    }
    this.line(`${head} {`);
    this.indented(() => {
      for (const line of lines) {
        this.line(line);
      }
    });
    this.line("}");
  }
}

type NetScope = {
  net: Pick<
    SDCPN,
    | "places"
    | "transitions"
    | "types"
    | "differentialEquations"
    | "parameters"
    | "componentInstances"
    | "fusions"
  >;
  subnetId: string | null;
  subnets: readonly Subnet[];
};

const placeRef = (scope: NetScope, endpoint: ArcEndpoint): string => {
  if (endpoint.kind === "place") {
    const place = scope.net.places.find(({ id }) => id === endpoint.placeId);
    return place ? dslName(place.name) : `?${endpoint.placeId}`;
  }
  const instance = (scope.net.componentInstances ?? []).find(
    ({ id }) => id === endpoint.componentInstanceId,
  );
  const subnet = instance
    ? scope.subnets.find(({ id }) => id === instance.subnetId)
    : undefined;
  const port = subnet?.places.find(({ id }) => id === endpoint.portPlaceId);
  return instance && port
    ? `${dslName(instance.name)}.${dslName(port.name)}`
    : `?${endpoint.componentInstanceId}.${endpoint.portPlaceId}`;
};

const plainWords = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]/gu, "");

const typeName = (scope: NetScope, colorId: string | null): string | null => {
  if (colorId === null) {
    return null;
  }
  const color = scope.net.types.find(({ id }) => id === colorId);
  return color ? dslName(color.name) : `?${colorId}`;
};

const printType = (writer: Writer, scope: NetScope, color: Color): void => {
  writer.span("type", color.id, scope.subnetId, () => {
    writer.doc(color.description);
    const elements = color.elements
      .map((element) => `${dslName(element.name)}: ${element.type}`)
      .join(", ");
    writer.line(`type ${dslName(color.name)} { ${elements} }`);
  });
};

const printParameter = (
  writer: Writer,
  scope: NetScope,
  parameter: Parameter,
): void => {
  writer.span("parameter", parameter.id, scope.subnetId, () => {
    // A label that only spells the variable name differently adds nothing.
    const label =
      plainWords(parameter.name) === plainWords(parameter.variableName)
        ? ""
        : ` ${JSON.stringify(parameter.name)}`;
    writer.line(
      `param ${parameter.variableName}${label}: ${parameter.type} = ${parameter.defaultValue}`,
    );
  });
};

const printDynamics = (
  writer: Writer,
  scope: NetScope,
  equation: DifferentialEquation,
): void => {
  writer.span("differentialEquation", equation.id, scope.subnetId, () => {
    const color = typeName(scope, equation.colorId);
    writer.code(
      "dynamics",
      equation.code,
      `dynamics ${dslName(equation.name)}${color === null ? "" : ` (${color})`}`,
    );
  });
};

const placeAttributes = (
  scope: NetScope,
  place: Place,
  subnet: Subnet | null,
): string => {
  const parts: string[] = [];
  if (place.isPort) {
    // The direction the port has, declared or read off the arcs.
    const direction = subnet
      ? effectivePortDirection(subnet, place)
      : (place.portDirection ?? "inout");
    parts.push(`port ${direction}`);
  } else {
    parts.push("place");
  }
  parts.push(dslName(place.name));
  const color = typeName(scope, place.colorId);
  if (color !== null) {
    parts[parts.length - 1] += `: ${color}`;
  }
  if (place.capacity !== undefined && place.capacity !== null) {
    parts.push(`capacity ${place.capacity}`);
  }
  if (place.dynamicsEnabled && place.differentialEquationId !== null) {
    const equation = scope.net.differentialEquations.find(
      ({ id }) => id === place.differentialEquationId,
    );
    parts.push(
      `dynamics ${equation ? dslName(equation.name) : `?${place.differentialEquationId}`}`,
    );
  }
  if (place.showAsInitialState) {
    parts.push("start");
  }
  return parts.join(" ");
};

const printPlace = (
  writer: Writer,
  scope: NetScope,
  place: Place,
  subnet: Subnet | null,
): void => {
  writer.span("place", place.id, scope.subnetId, () => {
    writer.doc(place.description);
    const head = placeAttributes(scope, place, subnet);
    if (place.visualizerCode === undefined || place.visualizerCode === "") {
      writer.line(head);
      return;
    }
    writer.line(`${head} {`);
    writer.indented(() => writer.code("visualizer", place.visualizerCode!));
    writer.line("}");
  });
};

const inputArcRef = (scope: NetScope, arc: InputArc): string => {
  const weight = arc.weight === 1 ? "" : `${arc.weight} `;
  const kind =
    arc.type === "standard"
      ? ""
      : `${arc.type === "read" ? "read" : "inhibit"} `;
  return `${weight}${kind}${placeRef(scope, getArcEndpoint(arc))}`;
};

const outputArcRef = (scope: NetScope, arc: OutputArc): string => {
  const weight = arc.weight === 1 ? "" : `${arc.weight} `;
  return `${weight}${placeRef(scope, getArcEndpoint(arc))}`;
};

const printTransition = (
  writer: Writer,
  scope: NetScope,
  transition: Transition,
): void => {
  writer.span("transition", transition.id, scope.subnetId, () => {
    writer.doc(transition.description);
    writer.line(`transition ${dslName(transition.name)} {`);
    writer.indented(() => {
      if (transition.inputArcs.length > 0 || transition.outputArcs.length > 0) {
        const inputs = transition.inputArcs
          .map((arc) => inputArcRef(scope, arc))
          .join(", ");
        const outputs = transition.outputArcs
          .map((arc) => outputArcRef(scope, arc))
          .join(", ");
        writer.line(
          `${inputs}${inputs === "" ? "" : " "}->${outputs === "" ? "" : ` ${outputs}`}`,
        );
      }
      if (transition.lambdaCode.trim() !== "") {
        writer.code(
          transition.lambdaType === "stochastic" ? "rate" : "guard",
          transition.lambdaCode,
        );
      }
      if (transition.transitionKernelCode.trim() !== "") {
        writer.code("kernel", transition.transitionKernelCode);
      }
    });
    writer.line("}");
  });
};

const printInstance = (
  writer: Writer,
  scope: NetScope,
  instance: NonNullable<SDCPN["componentInstances"]>[number],
): void => {
  writer.span("componentInstance", instance.id, scope.subnetId, () => {
    writer.doc(instance.description);
    const subnet = scope.subnets.find(({ id }) => id === instance.subnetId);
    const component = subnet ? dslName(subnet.name) : `?${instance.subnetId}`;
    const bindings = Object.entries(instance.parameterValues)
      .map(([parameterId, value]) => {
        const parameter = subnet?.parameters.find(
          ({ id }) => id === parameterId,
        );
        return `${parameter ? parameter.variableName : `?${parameterId}`} = ${value}`;
      })
      .join(", ");
    writer.line(
      `instance ${dslName(instance.name)} = ${component}${bindings === "" ? "" : `(${bindings})`}`,
    );
  });
};

const printFusion = (writer: Writer, scope: NetScope, fusion: Fusion): void => {
  writer.span("fusion", fusion.id, scope.subnetId, () => {
    writer.doc(fusion.description);
    const members = fusion.members
      .map((member) => placeRef(scope, member))
      .join(", ");
    const name = fusion.name === undefined ? "" : `${dslName(fusion.name)} = `;
    writer.line(`fuse ${name}${members}`);
  });
};

const printMetric = (writer: Writer, metric: Metric): void => {
  writer.span("metric", metric.id, null, () => {
    writer.doc(metric.description);
    writer.code("metric", metric.code, `metric ${dslName(metric.name)}`);
  });
};

const printScenario = (
  writer: Writer,
  root: SDCPN,
  scenario: Scenario,
): void => {
  writer.span("scenario", scenario.id, null, () => {
    writer.doc(scenario.description);
    writer.line(`scenario ${dslName(scenario.name)} {`);
    writer.indented(() => {
      for (const parameter of scenario.scenarioParameters) {
        writer.line(
          `param ${parameter.identifier}: ${parameter.type} = ${parameter.default}`,
        );
      }
      for (const [parameterId, value] of Object.entries(
        scenario.parameterOverrides,
      )) {
        const parameter = root.parameters.find(({ id }) => id === parameterId);
        writer.line(
          `override ${parameter ? parameter.variableName : `?${parameterId}`} = ${value}`,
        );
      }
      const { initialState } = scenario;
      if (initialState.type === "code") {
        writer.code("initial", initialState.content);
      } else if (initialState.type === "per_place") {
        const entries = Object.entries(initialState.content);
        if (entries.length > 0) {
          writer.line("initial {");
          writer.indented(() => {
            for (const [placeId, value] of entries) {
              const place = root.places.find(({ id }) => id === placeId);
              const name = place ? dslName(place.name) : `?${placeId}`;
              writer.line(
                `${name}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
              );
            }
          });
          writer.line("}");
        }
      } else {
        writer.line("// initial state authored with the scenario form");
      }
    });
    writer.line("}");
  });
};

/**
 * A net's declarations in dependency order. The root's sections are set
 * apart by blank lines; a component's run together, so a small component
 * reads as one block.
 */
const printNetBody = (
  writer: Writer,
  scope: NetScope,
  subnet: Subnet | null,
): void => {
  const { net } = scope;
  let section = 0;
  const separate = () => {
    if (section > 0 && subnet === null) {
      writer.blank();
    }
    section += 1;
  };
  if (net.types.length > 0) {
    separate();
    for (const color of net.types) {
      printType(writer, scope, color);
    }
  }
  if (net.parameters.length > 0) {
    separate();
    for (const parameter of net.parameters) {
      printParameter(writer, scope, parameter);
    }
  }
  if (net.differentialEquations.length > 0) {
    separate();
    for (const equation of net.differentialEquations) {
      printDynamics(writer, scope, equation);
    }
  }
  if (net.places.length > 0) {
    separate();
    for (const place of net.places) {
      printPlace(writer, scope, place, subnet);
    }
  }
  const instances = net.componentInstances ?? [];
  if (instances.length > 0) {
    separate();
    for (const instance of instances) {
      printInstance(writer, scope, instance);
    }
  }
  const fusions = net.fusions ?? [];
  if (fusions.length > 0) {
    separate();
    for (const fusion of fusions) {
      printFusion(writer, scope, fusion);
    }
  }
  if (net.transitions.length > 0) {
    separate();
    for (const transition of net.transitions) {
      printTransition(writer, scope, transition);
    }
  }
};

const printComponent = (
  writer: Writer,
  subnet: Subnet,
  subnets: readonly Subnet[],
): void => {
  writer.span("subnet", subnet.id, null, () => {
    writer.doc(subnet.description);
    const source =
      subnet.source === undefined
        ? ""
        : ` from ${JSON.stringify(`${subnet.source.library}/${subnet.source.component}`)}`;
    writer.line(`component ${dslName(subnet.name)}${source} {`);
    writer.indented(() =>
      printNetBody(
        writer,
        { net: subnet, subnetId: subnet.id, subnets },
        subnet,
      ),
    );
    writer.line("}");
  });
};

/**
 * Prints a document as DSL text: the net's header and description, its
 * components, then its own declarations in dependency order, then its
 * metrics and scenarios.
 */
export const printPetrinautDsl = ({
  sdcpn,
  title,
}: {
  sdcpn: SDCPN;
  title?: string;
}): DslPrintResult => {
  const writer = new Writer();
  const subnets = sdcpn.subnets ?? [];

  writer.span("net", "root", null, () => {
    writer.doc(sdcpn.description);
    const flag = sdcpn.componentsOnly ? " components-only" : "";
    writer.line(
      title === undefined
        ? `net${flag}`
        : `net ${JSON.stringify(title)}${flag}`,
    );
  });

  for (const subnet of subnets) {
    writer.blank();
    printComponent(writer, subnet, subnets);
  }

  const rootScope: NetScope = { net: sdcpn, subnetId: null, subnets };
  writer.blank();
  printNetBody(writer, rootScope, null);

  const metrics = sdcpn.metrics ?? [];
  if (metrics.length > 0) {
    writer.blank();
    for (const metric of metrics) {
      printMetric(writer, metric);
    }
  }
  const scenarios = sdcpn.scenarios ?? [];
  if (scenarios.length > 0) {
    writer.blank();
    for (const scenario of scenarios) {
      printScenario(writer, sdcpn, scenario);
    }
  }

  const { lines } = writer;
  while (lines.at(-1) === "") {
    lines.pop();
  }
  return { text: `${lines.join("\n")}\n`, spans: writer.spans };
};

import { describeName } from "./lower-petri-net-ir";
import { petriNetIrArcKind, petriNetIrArcWeight } from "./petri-net-ir";

import type { PetriNetIr, PetriNetIrArc } from "./petri-net-ir";
import type { ReactiveModuleGraph } from "./reactive-module-graph";

/**
 * A line trace over the rendered IR and the generated Python: which lines
 * belong to what, why the compiler wrote them, and the net item they come
 * from. The window shows a range's record on hover and lights the item on
 * the canvas. Ranges nest, section over entry over field, so a line's
 * record is the innermost range holding it.
 */

export type ProvenanceSource = {
  kind: "place" | "transition" | "colour" | "dynamics" | "net";
  /** The IR name; the window maps places and transitions to their net items. */
  name: string;
};

export type Provenance = {
  /** What the lines are, as a short noun phrase. */
  what: string;
  /** Why they are there, when the lines do not say it themselves. */
  why?: string;
  /** The IR path the lines render or compile from, `transitions.Serve.rate`. */
  ir?: string;
  source?: ProvenanceSource;
};

export type TraceRange = {
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
  provenance: Provenance;
};

export type Trace = TraceRange[];

/** The innermost range holding the line, or `null` off every range. */
export const provenanceAt = (trace: Trace, line: number): Provenance | null => {
  let best: TraceRange | null = null;
  for (const range of trace) {
    if (line < range.startLine || line > range.endLine) {
      continue;
    }
    if (
      best === null ||
      range.endLine - range.startLine < best.endLine - best.startLine
    ) {
      best = range;
    }
  }
  return best?.provenance ?? null;
};

// -- The IR ------------------------------------------------------------------

const KIND_WHY: Record<string, string> = {
  plain: "Every transition fires whenever it is enabled.",
  stochastic:
    "Every transition has a rate; a step tests each enabled one against a draw.",
  mixed: "Some transitions fire whenever enabled, others by rate.",
};

const FLAG_WHAT: Record<string, string> = {
  shape:
    "The shape flag: one module for the whole net, or one per transition and place",
  marking:
    "The marking flag: places typed as Real, or as Int with a Draw module per transition",
  control:
    "The control flag: controllable transitions fire when enabled, or wait for an external choice",
  dt: "The step length: rates are tested over it, dynamics take one Euler step of it",
  slots: "The slots a coloured place without a capacity gets",
  layout: "The layout flag: one Python file, or one per module plus net.py",
  syntax: "The syntax flag: the step method is called update or next",
};

const arcText = (arc: PetriNetIrArc): string => {
  const weight = petriNetIrArcWeight(arc);
  const kind = petriNetIrArcKind(arc);
  const tokens = weight === 1 ? "one token" : `${weight} tokens`;
  return kind === "standard"
    ? tokens
    : kind === "read"
      ? `reads ${tokens} and leaves them`
      : `fires only with fewer than ${weight} token${weight === 1 ? "" : "s"}`;
};

const transitionWhy = (ir: PetriNetIr, name: string): string => {
  const transition = ir.transitions[name];
  if (transition === undefined) {
    return "";
  }
  const inputs = Object.keys(transition.inputs ?? {});
  const outputs = Object.keys(transition.outputs ?? {});
  const parts = [
    inputs.length === 0 ? "takes nothing" : `takes from ${inputs.join(", ")}`,
    outputs.length === 0 ? "adds nothing" : `adds to ${outputs.join(", ")}`,
  ];
  if (transition.rate !== undefined) {
    parts.push(
      typeof transition.rate === "number"
        ? `fires at rate ${transition.rate}, tested over dt each step`
        : "fires at a rate its tokens decide, tested over dt each step",
    );
  } else if (transition.guard !== undefined) {
    parts.push("fires when enabled and its guard holds");
  } else {
    parts.push("fires whenever enabled");
  }
  if (transition.controllable === true) {
    parts.push("controllable");
  }
  return `${parts.join("; ")}.`;
};

const placeWhy = (ir: PetriNetIr, name: string): string => {
  const place = ir.places[name];
  const parts: string[] = [];
  const initial = ir.marking?.[name];
  if (initial !== undefined) {
    parts.push(
      typeof initial === "number"
        ? `starts with ${initial} token${initial === 1 ? "" : "s"}`
        : `starts with ${initial.length} token${initial.length === 1 ? "" : "s"}`,
    );
  } else {
    parts.push("starts empty");
  }
  if (place?.capacity !== undefined) {
    parts.push(`holds at most ${place.capacity}`);
  }
  if (place?.colour !== undefined) {
    parts.push(`tokens are ${place.colour} records`);
  }
  if (place?.dynamics !== undefined) {
    parts.push(`its tokens move by ${place.dynamics}`);
  }
  return `${parts.join("; ")}.`;
};

const describeIrPath = (ir: PetriNetIr, path: string[]): Provenance | null => {
  const [section, entry, field, sub] = path;
  const irPath = path.join(".");
  switch (section) {
    case "name":
      return {
        what: "The net's name, as the module calls itself",
        ir: irPath,
        source: { kind: "net", name: ir.name },
      };
    case "description":
      return { what: "The net's description", ir: irPath };
    case "kind":
      return { what: `A ${ir.kind} net`, why: KIND_WHY[ir.kind], ir: irPath };
    case "colours":
      if (entry === undefined) {
        return {
          what: "The token colours, each with its attributes and their types",
          ir: irPath,
        };
      }
      return field === undefined
        ? {
            what: `Colour ${entry}`,
            why: "A closed string attribute lists the values the net can write.",
            ir: irPath,
            source: { kind: "colour", name: entry },
          }
        : {
            what: `Attribute ${field} of ${entry}`,
            ir: irPath,
            source: { kind: "colour", name: entry },
          };
    case "dynamics":
      if (entry === undefined) {
        return {
          what: "The differential equations, each with the colour it moves",
          ir: irPath,
        };
      }
      return {
        what:
          field === "code"
            ? `The equation ${entry}, as the body you wrote`
            : field === "colour"
              ? `The colour ${entry} moves`
              : `Dynamics ${entry}`,
        why:
          field === undefined
            ? "Applied as one Euler step of dt before the transitions fire."
            : undefined,
        ir: irPath,
        source: { kind: "dynamics", name: entry },
      };
    case "places":
      if (entry === undefined) {
        return {
          what: "The places, in the order the net lists them",
          ir: irPath,
        };
      }
      if (field === undefined) {
        return {
          what: `Place ${entry}`,
          why: placeWhy(ir, entry),
          ir: irPath,
          source: { kind: "place", name: entry },
        };
      }
      return {
        what:
          field === "capacity"
            ? `${entry} holds at most ${ir.places[entry]?.capacity ?? ""} tokens`
            : field === "colour"
              ? `${entry}'s tokens are ${ir.places[entry]?.colour ?? ""} records`
              : `${entry}'s tokens move by ${ir.places[entry]?.dynamics ?? ""}`,
        ir: irPath,
        source: { kind: "place", name: entry },
      };
    case "marking":
      if (entry === undefined) {
        return {
          what: "The initial marking: the tokens each place starts with",
          why: "From the Simulation Settings' initial state; a place absent here starts empty.",
          ir: irPath,
        };
      }
      return {
        what:
          field === undefined
            ? `Initial tokens of ${entry}`
            : `A token ${entry} starts with`,
        ir: irPath,
        source: { kind: "place", name: entry },
      };
    case "transitions":
      if (entry === undefined) {
        return {
          what: "The transitions, in the order a step sweeps them",
          ir: irPath,
        };
      }
      if (field === undefined) {
        return {
          what: `Transition ${entry}`,
          why: transitionWhy(ir, entry),
          ir: irPath,
          source: { kind: "transition", name: entry },
        };
      }
      if (field === "inputs" || field === "outputs") {
        if (sub === undefined) {
          return {
            what:
              field === "inputs"
                ? `The arcs into ${entry}`
                : `The arcs out of ${entry}`,
            ir: irPath,
            source: { kind: "transition", name: entry },
          };
        }
        const arc = ir.transitions[entry]?.[field]?.[sub] ?? null;
        return {
          what:
            field === "inputs"
              ? `Arc from ${sub} into ${entry}: ${arcText(arc)}`
              : `Arc from ${entry} into ${sub}: ${arcText(arc)}`,
          // The arc's weight and kind lines describe the arc, not themselves.
          ir: path.slice(0, 4).join("."),
          source: { kind: "place", name: sub },
        };
      }
      return {
        what:
          field === "rate"
            ? `${entry}'s firing rate`
            : field === "guard"
              ? `${entry}'s guard, as the body you wrote`
              : field === "kernel"
                ? `${entry}'s kernel: the tokens it produces, as the body you wrote`
                : field === "controllable"
                  ? `${entry} is marked controllable in its metadata`
                  : `${field} of ${entry}`,
        why:
          field === "rate"
            ? "Tested over dt each step; code when the rate reads its tokens."
            : field === "guard"
              ? "Present when the condition reads its tokens; a constant condition is folded away."
              : undefined,
        ir: irPath,
        source: { kind: "transition", name: entry },
      };
    case "zeroth":
      return entry === undefined
        ? {
            what: "The compiler flags you changed from their defaults",
            why: "Written so the IR alone reproduces the Python.",
            ir: irPath,
          }
        : { what: FLAG_WHAT[entry] ?? `The ${entry} flag`, ir: irPath };
    default:
      return null;
  }
};

/** Traces the IR's rendered YAML: one range per section, entry, field and arc. */
export const tracePetriNetIr = (ir: PetriNetIr, text: string): Trace => {
  const lines = text.split("\n");
  const trace: Trace = [];
  // The open ranges by indent; a line at a lower or equal indent closes them.
  const open: { indent: number; path: string[]; start: number }[] = [];
  const close = (indent: number, before: number) => {
    while (open.length > 0 && open[open.length - 1]!.indent >= indent) {
      const range = open.pop()!;
      const provenance = describeIrPath(ir, range.path);
      if (provenance !== null) {
        let end = before - 1;
        while (end > range.start && lines[end - 1]?.trim() === "") {
          end -= 1;
        }
        trace.push({ startLine: range.start, endLine: end, provenance });
      }
    }
  };
  // The indent of a key whose value is a block scalar: the lines under it
  // are text, however much they look like keys.
  let blockIndent: number | null = null;
  lines.forEach((line, index) => {
    const number = index + 1;
    if (blockIndent !== null) {
      const leading = /^ */u.exec(line)![0].length;
      if (line.trim() === "" || leading > blockIndent) {
        return;
      }
      blockIndent = null;
    }
    // A key is bare, or quoted where YAML would read the bare word as another
    // value: the dumper quotes `On`, `Off`, `Yes`, `No`, `True`, `Null` and
    // the like.
    const key =
      /^( *)(?:- )?(?:'([^']*)'|"([^"]*)"|([A-Za-z_$][\w-]*)):(?: (.*)|$)/u.exec(
        line,
      );
    if (key === null) {
      return;
    }
    const indent = key[1]!.length;
    if (/^[|>][-+]?$/u.test(key[5] ?? "")) {
      blockIndent = indent;
    }
    close(indent, number);
    const parent = open[open.length - 1];
    open.push({
      indent,
      path: [...(parent?.path ?? []), key[2] ?? key[3] ?? key[4]!],
      start: number,
    });
  });
  close(-1, lines.length + 1);
  return trace.toSorted((a, b) => a.startLine - b.startLine);
};

// -- The Python ---------------------------------------------------------------

const moduleSource = (className: string, ir: PetriNetIr): ProvenanceSource => {
  const [prefix, ...rest] = className.split("_");
  const name = rest.join("_");
  if (name === "") {
    return { kind: "net", name: ir.name };
  }
  if (prefix === "Transition" || prefix === "Draw") {
    return { kind: "transition", name };
  }
  if (prefix === "Place") {
    return { kind: "place", name };
  }
  return { kind: "net", name: ir.name };
};

const describeVariableLine = (
  name: string,
  ir: PetriNetIr,
  comment: string | undefined,
  role: "declaration" | "statement",
): Provenance => {
  const described = describeName(name);
  if (described !== null) {
    // The emitter's trailing comment repeats the what for some names; it
    // joins the why only when it says something else.
    const notes = [...new Set([described.why, comment])].filter(
      (note): note is string =>
        note !== undefined && note !== "" && note !== described.what,
    );
    return {
      what:
        role === "statement"
          ? `Sets ${name}: ${described.what}`
          : described.what,
      ...(notes.length === 0 ? {} : { why: notes.join(" ") }),
      ...(described.source === undefined ? {} : { source: described.source }),
    };
  }
  if (name in ir.places) {
    return {
      what:
        role === "statement"
          ? `Sets the tokens in ${name}`
          : `The tokens in ${name}`,
      why: comment ?? placeWhy(ir, name),
      ir: `places.${name}`,
      source: { kind: "place", name },
    };
  }
  return {
    what: role === "statement" ? `A local of the step, ${name}` : name,
    why: comment,
  };
};

const METHOD_WHAT: Record<string, Provenance> = {
  init: {
    what: "The initial values of the variables the module drives, in order",
    why: "From the initial marking and parameter values the Simulation Settings resolve.",
  },
  update: {
    what: "One Petrinaut step: the statements, then the next values",
    why: "Transitions sweep in order, consumption is immediate, production lands at the end.",
  },
  next: {
    what: "One Petrinaut step: the statements, then the next values",
    why: "Transitions sweep in order, consumption is immediate, production lands at the end.",
  },
  flow: { what: "The continuous evolution between steps" },
};

/** Traces the generated Python: variables, modules, methods, statements and the system. */
export const traceReactiveModulePython = (
  graph: ReactiveModuleGraph,
  ir: PetriNetIr,
  text: string,
): Trace => {
  const lines = text.split("\n");
  const trace: Trace = [];
  const variables = new Map(
    graph.variables.map((variable) => [variable.name, variable]),
  );
  const modules = new Map(
    graph.modules.map((module) => [module.className, module]),
  );
  let classRange: TraceRange | null = null;
  let methodRange: TraceRange | null = null;
  let importsRange: TraceRange | null = null;
  const settle = (range: TraceRange | null, before: number) => {
    if (range === null) {
      return;
    }
    let end = before - 1;
    while (end > range.startLine && lines[end - 1]?.trim() === "") {
      end -= 1;
    }
    trace.push({ ...range, endLine: end });
  };
  lines.forEach((line, index) => {
    const number = index + 1;
    if (line.trim() === "") {
      return;
    }
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      settle(methodRange, number);
      methodRange = null;
      settle(classRange, number);
      classRange = null;
      if (!line.startsWith("from ") && !line.startsWith("import ")) {
        settle(importsRange, number);
        importsRange = null;
      }
    }
    if (number === 1 && line.startsWith('"""')) {
      trace.push({
        startLine: 1,
        endLine: 1,
        provenance: {
          what: "The file's header, naming the net it was generated from",
          source: { kind: "net", name: ir.name },
        },
      });
      return;
    }
    if (line.startsWith("from ") || line.startsWith("import ")) {
      importsRange ??= {
        startLine: number,
        endLine: number,
        provenance: {
          what: "What the module needs from zrth, and the modules of the other files",
          why: "Only the names the bodies use are imported.",
        },
      };
      return;
    }
    const sortConstant = /^([A-Z]+) = (Int|Real|Bool)\(\[1, 1\]\)$/u.exec(line);
    if (sortConstant !== null) {
      trace.push({
        startLine: number,
        endLine: number,
        provenance: {
          what: `The ${sortConstant[2]} sort of a single value`,
          why: "Every variable is a 1×1 tensor of this sort.",
        },
      });
      return;
    }
    const declaration = /^(\w+) = Var\(\w+\)(?:  # (.*))?$/u.exec(line);
    if (declaration !== null) {
      const [, name, comment] = declaration;
      const variable = variables.get(name!);
      const provenance = describeVariableLine(
        name!,
        ir,
        comment,
        "declaration",
      );
      trace.push({
        startLine: number,
        endLine: number,
        provenance:
          variable?.role === "input"
            ? {
                ...provenance,
                why: provenance.why ?? "An input the harness writes each step.",
              }
            : provenance,
      });
      return;
    }
    const classHeader = /^class (\w+)\(Module\):$/u.exec(line);
    if (classHeader !== null) {
      const className = classHeader[1]!;
      const module = modules.get(className);
      const source = moduleSource(className, ir);
      classRange = {
        startLine: number,
        endLine: number,
        provenance: {
          what:
            source.kind === "transition"
              ? className.startsWith("Draw_")
                ? `The draw module of ${source.name}`
                : `The module of transition ${source.name}`
              : source.kind === "place"
                ? `The module of place ${source.name}`
                : `The module of the whole net`,
          why: module?.docstring,
          ...(source.kind === "net"
            ? {}
            : { ir: `${source.kind}s.${source.name}` }),
          source,
        },
      };
      return;
    }
    const method = /^    def (\w+)\(/u.exec(line);
    if (method !== null) {
      settle(methodRange, number);
      const known = METHOD_WHAT[method[1]!];
      methodRange = {
        startLine: number,
        endLine: number,
        provenance: known ?? { what: `The ${method[1]} method` },
      };
      return;
    }
    const comment = /^        # (.*)$/u.exec(line);
    if (comment !== null) {
      trace.push({
        startLine: number,
        endLine: number,
        provenance: { what: comment[1]! },
      });
      return;
    }
    const statement = /^        (\w+) = (.*?)(?:  # (.*))?$/u.exec(line);
    if (statement !== null) {
      const [, target, , trailer] = statement;
      trace.push({
        startLine: number,
        endLine: number,
        provenance: describeVariableLine(target!, ir, trailer, "statement"),
      });
      return;
    }
    if (line.startsWith("        return ")) {
      trace.push({
        startLine: number,
        endLine: number,
        provenance: {
          what: methodRange?.provenance.what.startsWith("The initial")
            ? "The initial values, one per driven variable"
            : "The next values, one per driven variable, in the order the module drives them",
        },
      });
      return;
    }
    // Before the instance shape: the monolithic net is one instance itself.
    if (line.startsWith("net = ")) {
      trace.push({
        startLine: number,
        endLine: number,
        provenance: {
          what: "The system",
          why:
            graph.root.kind === "compose"
              ? "Every module composed: a variable one module drives is awaited by the others, in an order the awaits allow."
              : "The one module, driving every place.",
          source: { kind: "net", name: ir.name },
        },
      });
      return;
    }
    const instance =
      /^(\w+) = (\w+)\(theory=(\w+), ctrl=\(([^)]*)\)(?:, extl=\(([^)]*)\))?\)$/u.exec(
        line,
      );
    if (instance !== null) {
      const [, , className, theory, ctrl, extl] = instance;
      const source = moduleSource(className!, ir);
      const reads = extl?.replace(/,$/u, "") ?? "";
      trace.push({
        startLine: number,
        endLine: number,
        provenance: {
          what: `An instance of ${className} in the ${theory} theory`,
          why: `Drives ${ctrl!.replace(/,$/u, "")}${reads === "" ? "" : ` and reads ${reads}`}.`,
          source,
        },
      });
      return;
    }
    if (/^\s+\w+,$/u.test(line) || line === ")") {
      trace.push({
        startLine: number,
        endLine: number,
        provenance: {
          what: "The system",
          why: "The composition, one module per line.",
          source: { kind: "net", name: ir.name },
        },
      });
    }
  });
  settle(methodRange, lines.length + 1);
  settle(classRange, lines.length + 1);
  settle(importsRange, lines.length + 1);
  return trace.toSorted((a, b) => a.startLine - b.startLine);
};

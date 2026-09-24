import { provenanceAt } from "@hashintel/petrinaut-core/reactive-modules";

import type { SelectionItem } from "@hashintel/petrinaut-core";
import type {
  PetriNetIrOrigins,
  Provenance,
  Trace,
} from "@hashintel/petrinaut-core/reactive-modules";
import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api.js";

/**
 * The hover behind both tabs: a Monaco hover provider that reads the trace
 * registered for the model under the pointer, the net item a range maps to,
 * and the listeners that light that item on the canvas and select it on a
 * modifier click.
 */

export const MODEL_SCHEME = "petrinaut-reactive-modules";

export type TraceBinding = {
  trace: Trace;
  origins: PetriNetIrOrigins | null;
};

/** The net item a provenance record points at, when the origins know it. */
export const provenanceItem = (
  provenance: Provenance,
  origins: PetriNetIrOrigins | null,
): SelectionItem | null => {
  const source = provenance.source;
  if (source === undefined || origins === null) {
    return null;
  }
  if (source.kind === "place") {
    const id = origins.places[source.name];
    return id === undefined ? null : { type: "place", id };
  }
  if (source.kind === "transition") {
    const id = origins.transitions[source.name];
    return id === undefined ? null : { type: "transition", id };
  }
  return null;
};

/** The hover card's markdown: what, why, then where it comes from. */
export const provenanceMarkdown = (
  provenance: Provenance,
  item: SelectionItem | null,
): string => {
  const lines = [`**${provenance.what}**`];
  if (provenance.why !== undefined && provenance.why !== "") {
    lines.push("", provenance.why);
  }
  const sources = [
    ...(provenance.ir === undefined ? [] : [`IR \`${provenance.ir}\``]),
    ...(item === null
      ? []
      : [`${item.type} on the canvas, ⌘-click or Ctrl-click to select`]),
  ];
  if (sources.length > 0) {
    lines.push("", sources.join(" · "));
  }
  return lines.join("\n");
};

// One binding per model path, read by the provider at hover time.
const bindings = new Map<string, TraceBinding>();

export const bindTrace = (path: string, binding: TraceBinding): void => {
  bindings.set(path, binding);
};

export const unbindTrace = (path: string): void => {
  bindings.delete(path);
};

const bindingOf = (model: Monaco.editor.ITextModel): TraceBinding | null =>
  model.uri.scheme === MODEL_SCHEME
    ? (bindings.get(model.uri.path) ?? null)
    : null;

const registered = new WeakSet<typeof Monaco>();

/** Registers the hover provider for both grammars, once per Monaco instance. */
export const registerProvenanceHover = (monaco: typeof Monaco): void => {
  if (registered.has(monaco)) {
    return;
  }
  registered.add(monaco);
  for (const language of ["yaml", "python"]) {
    monaco.languages.registerHoverProvider(language, {
      provideHover: (model, position) => {
        const binding = bindingOf(model);
        if (binding === null) {
          return null;
        }
        const provenance = provenanceAt(binding.trace, position.lineNumber);
        if (provenance === null) {
          return null;
        }
        const item = provenanceItem(provenance, binding.origins);
        const range: Monaco.IRange = {
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: model.getLineMaxColumn(position.lineNumber),
        };
        return {
          range,
          contents: [{ value: provenanceMarkdown(provenance, item) }],
        };
      },
    });
  }
};

export type ProvenanceListeners = {
  onHoverItem: (item: SelectionItem | null) => void;
  onSelectItem: (item: SelectionItem) => void;
};

/**
 * Lights the net item under the pointer and selects it on a modifier click.
 * Returns the disposer.
 */
export const attachProvenanceListeners = (
  instance: Monaco.editor.IStandaloneCodeEditor,
  listeners: () => ProvenanceListeners,
): (() => void) => {
  let hovered: SelectionItem | null = null;
  const itemAt = (
    target: Monaco.editor.IMouseTarget | null,
  ): SelectionItem | null => {
    const model = instance.getModel();
    const line = target?.position?.lineNumber;
    if (model === null || line === undefined) {
      return null;
    }
    const binding = bindingOf(model);
    if (binding === null) {
      return null;
    }
    const provenance = provenanceAt(binding.trace, line);
    return provenance === null
      ? null
      : provenanceItem(provenance, binding.origins);
  };
  const disposables = [
    instance.onMouseMove((event) => {
      const item = itemAt(event.target);
      if (item?.id === hovered?.id && item?.type === hovered?.type) {
        return;
      }
      hovered = item;
      listeners().onHoverItem(item);
    }),
    instance.onMouseLeave(() => {
      if (hovered !== null) {
        hovered = null;
        listeners().onHoverItem(null);
      }
    }),
    instance.onMouseDown((event) => {
      if (!(event.event.metaKey || event.event.ctrlKey)) {
        return;
      }
      const item = itemAt(event.target);
      if (item !== null) {
        listeners().onSelectItem(item);
      }
    }),
  ];
  return () => {
    for (const disposable of disposables) {
      disposable.dispose();
    }
  };
};

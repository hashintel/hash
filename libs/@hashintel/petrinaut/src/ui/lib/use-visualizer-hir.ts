import { use } from "react";

import { LanguageClientContext } from "../../react/lsp/context";

import type {
  HirVisualizerContext,
  VisualizerHir,
} from "@hashintel/petrinaut-core";

type Lower = (
  code: string,
  context: HirVisualizerContext,
) => Promise<VisualizerHir>;

/**
 * Lowered visualizers, kept by their source and context.
 *
 * Lowering is a pure function of the code and the place's context, so each
 * pair is lowered once and its result kept, a failure too: a visualizer that
 * does not lower is asked for as often as one that does.
 *
 * Bounded, and least-recently-used first: editing the code produces an entry
 * per keystroke, so evicting by arrival would throw out the visualizers being
 * looked at to make room for one keystroke's worth of drafts. Keyed on the
 * lowering function as well, so results from one language client never
 * answer for another, the inert default included.
 */
const CACHE_LIMIT = 24;
const caches = new WeakMap<Lower, Map<string, Promise<VisualizerHir>>>();

const lowerCached = (
  lower: Lower,
  code: string,
  context: HirVisualizerContext,
): Promise<VisualizerHir> => {
  let cache = caches.get(lower);
  if (!cache) {
    cache = new Map();
    caches.set(lower, cache);
  }
  const key = `${JSON.stringify(context)}\u0000${code}`;
  const cached = cache.get(key);
  if (cached) {
    // Re-inserting makes this the newest entry, so use decides what survives.
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const promise = lower(code, context);
  cache.set(key, promise);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) {
      cache.delete(oldest.value);
    }
  }
  return promise;
};

/**
 * The lowered form of a visualizer, from the language worker. Suspends
 * while the worker answers, so the caller sits under a `Suspense` boundary.
 */
export const useVisualizerHir = (
  code: string,
  context: HirVisualizerContext,
): VisualizerHir => {
  const { requestVisualizerHir } = use(LanguageClientContext);
  return use(lowerCached(requestVisualizerHir, code, context));
};

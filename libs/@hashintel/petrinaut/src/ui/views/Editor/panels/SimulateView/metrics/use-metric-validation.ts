/**
 * Asynchronous metric compile-check used by the create / view drawers.
 *
 * Live form validation needs to display compile errors as the user
 * types. We route through {@link useEvalSandbox} so that — when the
 * iframe sandbox is active — the `new Function` call happens inside the
 * iframe (host CSP forbids `unsafe-eval`).
 *
 * The hook only validates: on success it disposes the evaluator
 * immediately. The actual frame-by-frame evaluation in the timeline
 * builds its own evaluator that stays live.
 */

import { useEffect, useState } from "react";

import { useEvalSandbox } from "../../../../../../react/eval-sandbox/context";

import type { Metric } from "@hashintel/petrinaut-core";

interface MetricForValidation {
  id: string;
  name: string;
  code: string;
}

export function useMetricValidation(metric: MetricForValidation): {
  compileError: string | null;
  isValidating: boolean;
} {
  const evalSandbox = useEvalSandbox();
  const [compileError, setCompileError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const trimmedCode = metric.code.trim();

  useEffect(() => {
    const tracker = { cancelled: false };
    if (trimmedCode === "") {
      // Defer the clear so the setState isn't synchronous-in-effect.
      void Promise.resolve().then(() => {
        if (tracker.cancelled) {
          return;
        }
        setCompileError(null);
        setIsValidating(false);
      });
      return () => {
        tracker.cancelled = true;
      };
    }
    // Use Promise.resolve() to keep the `setIsValidating(true)` off the
    // synchronous effect path (matches the deferred pattern above).
    void Promise.resolve().then(() => {
      if (tracker.cancelled) {
        return;
      }
      setIsValidating(true);
    });
    evalSandbox
      .createMetricEvaluator({
        id: metric.id,
        name: metric.name,
        code: metric.code,
      } as Metric)
      .then((evaluator) => {
        evaluator.dispose();
        if (tracker.cancelled) {
          return;
        }
        setCompileError(null);
      })
      .catch((err: unknown) => {
        if (tracker.cancelled) {
          return;
        }
        setCompileError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (tracker.cancelled) {
          return;
        }
        setIsValidating(false);
      });
    return () => {
      tracker.cancelled = true;
    };
  }, [evalSandbox, metric.code, metric.id, metric.name, trimmedCode]);

  return { compileError, isValidating };
}

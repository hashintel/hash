import { useEffect, useState } from "react";

import { useLatest } from "../../../../../react/hooks/use-latest";

import type { LanguageClientContextValue } from "../../../../../react/lsp/context";
import type {
  HirArtifacts,
  PetrinautExtensionSettings,
  SDCPN,
} from "@hashintel/petrinaut-core";

/** Each transition's condition lowered to HIR, keyed by transition id. */
export type LambdaHir = Readonly<
  Record<string, HirArtifacts["lambdas"][string]["hir"]>
>;

export type LambdaHirState = {
  /**
   * `stale` means the net's code changed and the worker has not answered
   * yet; the previous lowering still stands in for the transitions it covers.
   */
  status: "compiling" | "ready" | "stale" | "error";
  lambdaHir: LambdaHir | null;
  error: string | null;
};

/**
 * The parts of the net a condition's lowering depends on: its code, the
 * places and parameters it may read, and the extensions that decide whether
 * it compiles at all. Moving a node must not send the net back to the
 * worker.
 */
const lambdaCodeKey = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): string =>
  JSON.stringify({
    extensions,
    parameters: sdcpn.parameters,
    types: sdcpn.types,
    places: sdcpn.places.map(({ id, name, colorId }) => ({
      id,
      name,
      colorId,
    })),
    transitions: sdcpn.transitions.map(
      ({ id, lambdaType, lambdaCode, inputArcs }) => ({
        id,
        lambdaType,
        lambdaCode,
        inputArcs,
      }),
    ),
  });

/**
 * Lowers the net's conditions in the language worker whenever their code
 * changes. Compiling there is asynchronous and the net changes as the user
 * edits, so a stale answer never overwrites a newer one.
 */
export const useLambdaHir = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
  requestHirArtifacts: LanguageClientContextValue["requestHirArtifacts"],
): LambdaHirState => {
  const key = lambdaCodeKey(sdcpn, extensions);
  const latest = useLatest({ sdcpn, extensions });
  const [entry, setEntry] = useState<{
    key: string;
    lambdaHir: LambdaHir | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const current = latest.current;
    requestHirArtifacts(current.sdcpn, current.extensions, {
      // The export reads the HIR trees themselves; they are not carried by default.
      includeHir: true,
    })
      .then(({ artifacts }) => {
        if (cancelled) {
          return;
        }
        setEntry({
          key,
          lambdaHir: Object.fromEntries(
            Object.entries(artifacts.lambdas).map(([id, artifact]) => [
              id,
              artifact.hir,
            ]),
          ),
          error: null,
        });
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        setEntry({
          key,
          lambdaHir: null,
          error: caught instanceof Error ? caught.message : String(caught),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [key, latest, requestHirArtifacts]);

  if (entry === null) {
    return { status: "compiling", lambdaHir: null, error: null };
  }
  if (entry.error !== null) {
    return { status: "error", lambdaHir: null, error: entry.error };
  }
  return {
    status: entry.key === key ? "ready" : "stale",
    lambdaHir: entry.lambdaHir,
    error: null,
  };
};

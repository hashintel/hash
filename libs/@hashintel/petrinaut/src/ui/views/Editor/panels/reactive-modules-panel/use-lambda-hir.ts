import { useEffect, useState } from "react";

import { useLatest } from "../../../../../react/hooks/use-latest";

import type { LanguageClientContextValue } from "../../../../../react/lsp/context";
import type {
  HirArtifacts,
  PetrinautExtensionSettings,
  SDCPN,
} from "@hashintel/petrinaut-core";

/** Lowered code keyed by the id of the transition or equation it belongs to. */
export type HirById = Readonly<
  Record<string, HirArtifacts["lambdas"][string]["hir"]>
>;

/** The net's code lowered to HIR: conditions and kernels by transition, equations by id. */
export type NetHir = {
  lambdaHir: HirById;
  kernelHir: HirById;
  dynamicsHir: HirById;
};

export type LambdaHirState = {
  /**
   * `stale` means the net's code changed and the worker has not answered
   * yet; the previous lowering still stands in for the transitions it covers.
   */
  status: "compiling" | "ready" | "stale" | "error";
  netHir: NetHir | null;
  error: string | null;
};

/**
 * The parts of the net the code's lowering depends on: the code itself, the
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
    differentialEquations: sdcpn.differentialEquations,
    places: sdcpn.places.map(
      ({ id, name, colorId, dynamicsEnabled, differentialEquationId }) => ({
        id,
        name,
        colorId,
        dynamicsEnabled,
        differentialEquationId,
      }),
    ),
    transitions: sdcpn.transitions.map(
      ({
        id,
        lambdaType,
        lambdaCode,
        transitionKernelCode,
        inputArcs,
        outputArcs,
      }) => ({
        id,
        lambdaType,
        lambdaCode,
        transitionKernelCode,
        inputArcs,
        outputArcs,
      }),
    ),
  });

const hirById = (
  artifacts: Record<string, { hir?: HirArtifacts["lambdas"][string]["hir"] }>,
): HirById =>
  Object.fromEntries(
    Object.entries(artifacts).map(([id, artifact]) => [id, artifact.hir]),
  );

/**
 * Lowers the net's conditions, kernels and equations in the language worker
 * whenever their code changes. Compiling there is asynchronous and the net
 * changes as the user edits, so a stale answer never overwrites a newer one.
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
    netHir: NetHir | null;
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
          netHir: {
            lambdaHir: hirById(artifacts.lambdas),
            kernelHir: hirById(artifacts.kernels),
            dynamicsHir: hirById(artifacts.dynamics),
          },
          error: null,
        });
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        setEntry({
          key,
          netHir: null,
          error: caught instanceof Error ? caught.message : String(caught),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [key, latest, requestHirArtifacts]);

  if (entry === null) {
    return { status: "compiling", netHir: null, error: null };
  }
  if (entry.error !== null) {
    return { status: "error", netHir: null, error: entry.error };
  }
  return {
    status: entry.key === key ? "ready" : "stale",
    netHir: entry.netHir,
    error: null,
  };
};

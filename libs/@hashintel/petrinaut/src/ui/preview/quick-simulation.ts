import {
  PLAYBACK_SPEEDS,
  type HirArtifacts,
  type PlaybackSpeed,
  type ScenarioHir,
  type SDCPN,
  type WorkerFactory,
} from "@hashintel/petrinaut-core";

import type { SimulationCompiler } from "../../react/simulation/provider";
import type { SimulationParameterBoundsByIdentifier } from "../views/shared/simulation-parameter-bounds";

/** Build-time simulation inputs supplied by an embed host. */
export type PetrinautPreviewQuickSimulation = {
  /** HIR compiled for the exact immutable definition passed to Preview. */
  hirArtifacts: HirArtifacts;
  /** Pre-lowered HIR for every named scenario exposed by the definition. */
  scenarioHirById: Readonly<Record<string, ScenarioHir>>;
  /**
   * Simulation step size, in seconds. Preview does not expose this; when
   * omitted, the simulation provider's default applies.
   */
  dt?: number;
  /**
   * Simulation horizon, in seconds. Preview does not expose this; when
   * omitted, the simulation runs until paused.
   */
  maxTime?: number;
  /** Optional host-specific simulation worker constructor. */
  workerFactory?: WorkerFactory;
  /** Speeds offered by Preview's compact playback menu. */
  allowedPlaybackSpeeds?: readonly PlaybackSpeed[];
  /** Initial playback speed. Must be one of `allowedPlaybackSpeeds`. */
  defaultPlaybackSpeed?: PlaybackSpeed;
  /** Safe UI bounds for scenario parameters, keyed by identifier. */
  parameterBounds?: SimulationParameterBoundsByIdentifier;
};

export type PreviewPlaybackOptions = {
  allowedPlaybackSpeeds: readonly PlaybackSpeed[];
  defaultPlaybackSpeed: PlaybackSpeed;
};

/** Resolve and validate the compact playback menu's host-owned policy. */
export const resolvePreviewPlaybackOptions = (
  quickSimulation: Pick<
    PetrinautPreviewQuickSimulation,
    "allowedPlaybackSpeeds" | "defaultPlaybackSpeed"
  >,
): PreviewPlaybackOptions => {
  if (quickSimulation.allowedPlaybackSpeeds?.length === 0) {
    throw new Error(
      "Preview Quick Simulation requires at least one allowed playback speed",
    );
  }

  const allowedPlaybackSpeeds =
    quickSimulation.allowedPlaybackSpeeds ?? PLAYBACK_SPEEDS;
  const defaultPlaybackSpeed =
    quickSimulation.defaultPlaybackSpeed ?? allowedPlaybackSpeeds[0] ?? 1;

  if (!allowedPlaybackSpeeds.includes(defaultPlaybackSpeed)) {
    throw new Error(
      `Preview Quick Simulation default playback speed (${defaultPlaybackSpeed}) must be allowed`,
    );
  }

  return { allowedPlaybackSpeeds, defaultPlaybackSpeed };
};

/** Fail fast when build-time artifacts cannot cover the model's scenarios. */
export const validatePreviewQuickSimulation = (
  definition: Pick<SDCPN, "scenarios">,
  quickSimulation: Pick<PetrinautPreviewQuickSimulation, "scenarioHirById">,
): void => {
  const scenarios = definition.scenarios ?? [];
  if (scenarios.length === 0) {
    throw new Error(
      "Preview Quick Simulation requires at least one named scenario",
    );
  }

  const missingScenarioIds = scenarios
    .map(({ id }) => id)
    .filter(
      (scenarioId) =>
        !Object.hasOwn(quickSimulation.scenarioHirById, scenarioId),
    );
  if (missingScenarioIds.length > 0) {
    throw new Error(
      `Preview Quick Simulation is missing precompiled HIR for: ${missingScenarioIds.join(
        ", ",
      )}`,
    );
  }
};

/**
 * Adapt immutable, build-time artifacts to the compiler seam shared with the
 * full editor. No language worker is mounted in Preview.
 */
export const createPreviewSimulationCompiler = (
  quickSimulation: Pick<
    PetrinautPreviewQuickSimulation,
    "hirArtifacts" | "scenarioHirById"
  >,
): SimulationCompiler => ({
  requestHirArtifacts: () =>
    Promise.resolve({ artifacts: quickSimulation.hirArtifacts, failures: [] }),
  requestScenarioHir: (_scenario, _adHocContext, scenarioId) => {
    if (!scenarioId) {
      return Promise.reject(
        new Error("Preview Quick Simulation requires a named scenario"),
      );
    }

    const scenarioHir = Object.hasOwn(
      quickSimulation.scenarioHirById,
      scenarioId,
    )
      ? quickSimulation.scenarioHirById[scenarioId]
      : undefined;
    return scenarioHir
      ? Promise.resolve(scenarioHir)
      : Promise.reject(
          new Error(
            `No precompiled scenario HIR is available for "${scenarioId}"`,
          ),
        );
  },
});

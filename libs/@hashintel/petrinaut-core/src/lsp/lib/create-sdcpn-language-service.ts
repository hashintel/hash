import { SDCPN_LANGUAGE_SERVICE_HOST } from "./create-language-service-host";
import {
  generateAdHocSessionFiles,
  generateConstraintSessionFiles,
  generateMetricSessionFiles,
  generateScenarioSessionFiles,
  generateVirtualFiles,
  type AdHocSessionData,
  type ConstraintSessionData,
  type MetricSessionData,
  type ScenarioSessionData,
} from "./generate-virtual-files";
import { VirtualFileLanguageServer } from "./virtual-file-language-server";

import type { PetrinautExtensionSettings } from "../../extensions";
import type { SDCPN } from "../../types/sdcpn";
import type { VirtualFile } from "./create-language-service-host";

/**
 * Persistent TypeScript language server for SDCPN code validation: the net's
 * dynamics, lambda and kernel code, plus the scenario, metric, ad-hoc and
 * constraint editing sessions. Place visualizers are JSX and live in the
 * `VisualizerLanguageServer`, a program of their own.
 */
export class SDCPNLanguageServer extends VirtualFileLanguageServer {
  constructor() {
    super(SDCPN_LANGUAGE_SERVICE_HOST);
  }

  /**
   * Sync virtual files to match the given SDCPN model.
   * Diffs against the current state: adds new files, updates changed files,
   * removes files that no longer exist.
   *
   * Files under `/_temp/` are managed separately (e.g., scenario sessions)
   * and are not removed by this method.
   */
  syncFiles(sdcpn: SDCPN, extensions?: PetrinautExtensionSettings): void {
    this.reconcileFiles(
      generateVirtualFiles(sdcpn, extensions),
      (fileName) => !fileName.startsWith("/_temp/"),
    );
  }

  /**
   * Make the files under `sessionPrefix` match `newFiles`: files absent from
   * the new set are removed, new ones added, changed ones updated.
   */
  private syncSessionFiles(
    sessionPrefix: string,
    newFiles: Map<string, VirtualFile>,
  ): void {
    this.reconcileFiles(newFiles, (fileName) =>
      fileName.startsWith(sessionPrefix),
    );
  }

  /**
   * Sync virtual files for a scenario editing session.
   * Updates content from the session data (form state is the source of truth).
   */
  syncScenarioFiles(sdcpn: SDCPN, session: ScenarioSessionData): void {
    this.syncSessionFiles(
      `/_temp/scenarios/${session.sessionId}/`,
      generateScenarioSessionFiles(sdcpn, session),
    );
  }

  /** Remove all virtual files for a scenario session. */
  removeScenarioSession(sessionId: string): void {
    this.removeFilesUnder(`/_temp/scenarios/${sessionId}/`);
  }

  /** Get all file paths that belong to a scenario session. */
  getScenarioFileNames(sessionId: string): string[] {
    return this.getFileNamesUnder(`/_temp/scenarios/${sessionId}/`);
  }

  /**
   * Sync virtual files for an ad-hoc scenario editing session.
   * Updates content from the session data (form state is the source of truth).
   */
  syncAdHocFiles(sdcpn: SDCPN, session: AdHocSessionData): void {
    this.syncSessionFiles(
      `/_temp/adhoc/${session.sessionId}/`,
      generateAdHocSessionFiles(sdcpn, session),
    );
  }

  /** Remove all virtual files for an ad-hoc scenario session. */
  removeAdHocSession(sessionId: string): void {
    this.removeFilesUnder(`/_temp/adhoc/${sessionId}/`);
  }

  /** Get all file paths that belong to an ad-hoc scenario session. */
  getAdHocFileNames(sessionId: string): string[] {
    return this.getFileNamesUnder(`/_temp/adhoc/${sessionId}/`);
  }

  /**
   * Sync virtual files for a metric editing session.
   * Updates content from the session data (form state is the source of truth).
   */
  syncMetricFiles(sdcpn: SDCPN, session: MetricSessionData): void {
    this.syncSessionFiles(
      `/_temp/metrics/${session.sessionId}/`,
      generateMetricSessionFiles(sdcpn, session),
    );
  }

  /** Remove all virtual files for a metric session. */
  removeMetricSession(sessionId: string): void {
    this.removeFilesUnder(`/_temp/metrics/${sessionId}/`);
  }

  /** Get all file paths that belong to a metric session. */
  getMetricFileNames(sessionId: string): string[] {
    return this.getFileNamesUnder(`/_temp/metrics/${sessionId}/`);
  }

  /**
   * Sync virtual files for a constraint editing session.
   * Updates content from the session data (form state is the source of truth).
   */
  syncConstraintFiles(sdcpn: SDCPN, session: ConstraintSessionData): void {
    this.syncSessionFiles(
      `/_temp/constraints/${session.sessionId}/`,
      generateConstraintSessionFiles(sdcpn, session),
    );
  }

  /** Remove all virtual files for a constraint session. */
  removeConstraintSession(sessionId: string): void {
    this.removeFilesUnder(`/_temp/constraints/${sessionId}/`);
  }

  /** Get all file paths that belong to a constraint session. */
  getConstraintFileNames(sessionId: string): string[] {
    return this.getFileNamesUnder(`/_temp/constraints/${sessionId}/`);
  }
}

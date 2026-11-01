import { SDCPNLanguageServer } from "./create-sdcpn-language-service";
import { VisualizerLanguageServer } from "./create-visualizer-language-service";
import { parsePlaceVisualizerCodeFilePath } from "./file-paths";

import type { PetrinautExtensionSettings } from "../../extensions";
import type { SDCPN } from "../../types/sdcpn";
import type { VirtualFileLanguageServer } from "./virtual-file-language-server";

/**
 * The two programs a net is checked with: the SDCPN service for dynamics,
 * lambda and kernel code and the editing sessions, and the JSX service for
 * place visualizers. Kept apart because their compiler options differ and so
 * that an edit to one never re-checks the other.
 */
export type LanguageServers = {
  readonly sdcpn: SDCPNLanguageServer;
  readonly visualizer: VisualizerLanguageServer;
};

export const createLanguageServers = (): LanguageServers => ({
  sdcpn: new SDCPNLanguageServer(),
  visualizer: new VisualizerLanguageServer(),
});

/** Sync both programs' net files to `sdcpn`. Session files are left alone. */
export const syncLanguageServers = (
  servers: LanguageServers,
  sdcpn: SDCPN,
  extensions?: PetrinautExtensionSettings,
): void => {
  servers.sdcpn.syncFiles(sdcpn, extensions);
  servers.visualizer.syncFiles(sdcpn, extensions);
};

/**
 * The program that holds `filePath`: visualizer code goes to the JSX
 * service, every other file to the SDCPN service.
 */
export const languageServerForFile = (
  servers: LanguageServers,
  filePath: string,
): VirtualFileLanguageServer =>
  parsePlaceVisualizerCodeFilePath(filePath)
    ? servers.visualizer
    : servers.sdcpn;

export const disposeLanguageServers = (servers: LanguageServers): void => {
  servers.sdcpn.dispose();
  servers.visualizer.dispose();
};

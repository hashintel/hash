import { getStatusConditionArtifactKey } from "@hashintel/petrinaut-core";

import type { LanguageClientContextValue } from "../../../../../../react/lsp/context";
import type {
  PetrinautExtensionSettings,
  SDCPN,
  StatusView,
} from "@hashintel/petrinaut-core";

/**
 * Compiles the exact status view being submitted — every label token
 * condition is lowered and type-checked against the label's places'
 * colours — and reports the first failing label's diagnostics.
 */
export async function validateStatusViewCompiles(args: {
  requestHirArtifacts: LanguageClientContextValue["requestHirArtifacts"];
  sdcpn: SDCPN;
  extensions: PetrinautExtensionSettings;
  statusView: StatusView;
}): Promise<string | undefined> {
  const { requestHirArtifacts, sdcpn, extensions, statusView } = args;
  const labelsWithConditions = statusView.labels.filter(
    (label) => (label.tokenCondition ?? "").trim() !== "",
  );
  if (labelsWithConditions.length === 0) {
    return undefined;
  }

  try {
    const { artifacts, failures } = await requestHirArtifacts(
      { ...sdcpn, statusViews: [statusView] },
      extensions,
    );

    for (const label of labelsWithConditions) {
      if (
        artifacts.statusConditions[
          getStatusConditionArtifactKey(statusView.id, label.id)
        ]
      ) {
        continue;
      }
      const messages = failures
        .filter(
          (failure) =>
            failure.itemType === "status-label-condition" &&
            failure.itemId === label.id,
        )
        .flatMap((failure) =>
          failure.diagnostics.map((diagnostic) => diagnostic.message),
        );
      return (
        `Label "${label.name}": ` +
        (messages.join("; ") || "the token condition did not compile.")
      );
    }
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

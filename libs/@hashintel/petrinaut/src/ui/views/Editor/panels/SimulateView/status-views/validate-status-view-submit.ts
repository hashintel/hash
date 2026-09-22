import { statusViewSchema } from "@hashintel/petrinaut-core";

import { validateStatusViewCompiles } from "./status-view-lsp";
import { buildStatusViewFromFormState } from "./status-view-mapping";

import type { LanguageClientContextValue } from "../../../../../../react/lsp/context";
import type { StatusViewFormState } from "./status-view-form";
import type {
  PetrinautExtensionSettings,
  SDCPN,
} from "@hashintel/petrinaut-core";

/**
 * Submit-time validation for both status view drawers: the form state must
 * build a view the schema accepts, and every label condition must compile
 * against the net. Resolves to the first error message, or undefined.
 */
export const validateStatusViewSubmit = async (args: {
  value: StatusViewFormState;
  statusViewId: string;
  sdcpn: SDCPN;
  extensions: PetrinautExtensionSettings;
  requestHirArtifacts: LanguageClientContextValue["requestHirArtifacts"];
}): Promise<string | undefined> => {
  const parsed = statusViewSchema.safeParse(
    buildStatusViewFromFormState(args.value, args.statusViewId),
  );
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "The status view is invalid.";
  }
  return await validateStatusViewCompiles({
    requestHirArtifacts: args.requestHirArtifacts,
    sdcpn: args.sdcpn,
    extensions: args.extensions,
    statusView: parsed.data,
  });
};

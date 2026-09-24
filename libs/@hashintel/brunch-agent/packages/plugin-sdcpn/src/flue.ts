import { createHash } from "node:crypto";

import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import {
  INTEGRATED_PETRINAUT_MODES,
  STOCK_OVER_FLUE_MODE,
  isIntegratedPetrinautMode,
} from "./construction-mode";
import {
  READ_PETRINAUT_DOCS_TOOL_NAME,
  isReadPetrinautDocsToolName,
  readPetrinautDiagnosticsToolName,
  readPetrinautNetToolName,
} from "./construction-tool-names";
import {
  declarePetrinautProjectionToolName,
  declaredProjectionInputSchema,
  declaredProjectionOutputSchema,
  resolveDeclaredProjectionOutput,
} from "./declared-basis";
import { draftPetrinautExperimentToolName } from "./draft-experiment";
import { batchedConstructionMode } from "./mutate-petrinet";
import { browserBindingSchema } from "./root-arc";
import { type WorkpieceAuthorityOptions } from "./tools/petrinaut-construction";
import { readPetrinautDocs } from "./tools/read-petrinaut-doc";

export const VALIDATED_CONSTRUCTION_MODE = "validated-construction";
export {
  BRUNCH_DECLARED_PROJECTION_MODE,
  BRUNCH_DEEP_CONSTRUCTION_MODE,
  CANONICAL_PETRINAUT_TOOLS_MODE,
  INTEGRATED_BRUNCH_MODE,
  STOCK_OVER_FLUE_MODE,
  isIntegratedPetrinautMode,
  type CanonicalPetrinautMode,
  type IntegratedPetrinautMode,
} from "./construction-mode";
export {
  applyPetrinautConstructionToolName,
  batchedConstructionMode,
  mutatePetrinautNetToolName,
} from "./mutate-petrinet";

export const sdcpnInitialDataSchema = v.optional(
  v.pipe(
    v.object({
      mode: v.picklist([
        VALIDATED_CONSTRUCTION_MODE,
        STOCK_OVER_FLUE_MODE,
        ...INTEGRATED_PETRINAUT_MODES,
        batchedConstructionMode,
      ]),
      construction: v.optional(
        v.strictObject({ binding: browserBindingSchema }),
      ),
    }),
    v.check(
      (data) =>
        data.mode === batchedConstructionMode ||
        data.mode === STOCK_OVER_FLUE_MODE ||
        isIntegratedPetrinautMode(data.mode)
          ? data.construction !== undefined
          : data.construction === undefined,
      "Construction requires a distinct immutable binding and mode.",
    ),
  ),
);

export type SdcpnInitialData = v.InferOutput<typeof sdcpnInitialDataSchema>;

type SdcpnInitialDataFields = NonNullable<SdcpnInitialData>;

/** The browser the agent is bound to: its immutable conversation binding. */
export type BrowserContext = NonNullable<
  SdcpnInitialDataFields["construction"]
>;

const createDeclarePetrinautProjectionTool = (
  currentRevision: WorkpieceAuthorityOptions["currentRevision"],
) =>
  defineTool({
    name: declarePetrinautProjectionToolName,
    description:
      "Declare one bounded intended Petrinaut projection before direct canonical mutation calls. The host binds it to the current settled Ledger and resolves any exact excerpts. This records intent only: it neither executes operations nor reports their effects.",
    input: declaredProjectionInputSchema,
    output: declaredProjectionOutputSchema,
    run({ data }) {
      if (!currentRevision)
        throw new Error(
          "Settle a current Ledger revision before declaring a projection.",
        );
      if (
        createHash("sha256")
          .update(currentRevision.markdown, "utf8")
          .digest("hex") !== currentRevision.sha256
      )
        throw new Error(
          "Current Ledger revision hash does not match its content.",
        );
      return {
        output: resolveDeclaredProjectionOutput(data, currentRevision),
        terminate: false,
      };
    },
  });

export {
  isReadPetrinautDocsToolName,
  READ_PETRINAUT_DOCS_TOOL_NAME,
  readPetrinautDiagnosticsToolName,
  readPetrinautDocs,
  readPetrinautNetToolName,
};
export {
  createDeclarePetrinautProjectionTool,
  declarePetrinautProjectionToolName,
  draftPetrinautExperimentToolName,
};
export {
  CANONICAL_PETRINAUT_TOOL_NAMES,
  canonicalPetrinautTools,
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  layoutPetrinautNetToolName,
  petrinautConstructionTools,
  type PetrinautConstructionToolName,
} from "./tools/petrinaut-construction";

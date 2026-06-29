import { opportunityBriefSection } from "./docs-content/opportunity-brief";
import { productOverviewSection } from "./docs-content/product-overview";
import { settingsSection } from "./docs-content/settings";
import { siteOverviewSection } from "./docs-content/site-overview";
import { stepDetailDoc } from "./docs-content/step-detail";
import { dwellDoc } from "./docs-content/step-dwell";
import { procurementDoc } from "./docs-content/step-procurement";
import { productionDoc } from "./docs-content/step-production";
import { qaDoc } from "./docs-content/step-qa";
import { transitDoc } from "./docs-content/step-transit";

import type { StepType } from "../../types";
import type { DocSectionDef, DocSectionId, DocTarget } from "../docs-types";

const stepsSection: DocSectionDef = {
  id: "steps",
  title: "Steps",
  entries: [
    stepDetailDoc,
    procurementDoc,
    dwellDoc,
    productionDoc,
    qaDoc,
    transitDoc,
  ],
};

/** The full docs navigation tree, in sidebar order. */
export const DOC_SECTIONS: DocSectionDef[] = [
  siteOverviewSection,
  productOverviewSection,
  stepsSection,
  opportunityBriefSection,
  settingsSection,
];

export type { DocSectionId, DocTarget };

/**
 * Map a value-chain step type onto the docs target to open from the step
 * slideover. Dwell variants share the single Dwell entry but deep-link to the
 * matching span anchor.
 */
export function stepDocTarget(type: StepType): DocTarget {
  switch (type) {
    case "procurement":
      return { section: "steps", sub: "procurement" };
    case "production":
      return { section: "steps", sub: "production" };
    case "qa_hold":
      return { section: "steps", sub: "qa" };
    case "transit":
      return { section: "steps", sub: "transit" };
    case "raw_material_dwell":
      return { section: "steps", sub: "dwell-raw-material" };
    case "intermediate_dwell":
      return { section: "steps", sub: "dwell-intermediate" };
    case "post_qa_ship":
      return { section: "steps", sub: "dwell-post-qa-ship" };
    case "destination_dwell":
      return { section: "steps", sub: "dwell-destination" };
    default:
      return { section: "steps", sub: "procurement" };
  }
}

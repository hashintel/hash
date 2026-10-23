import { petrinautDocsContent } from "@hashintel/petrinaut/ui";

import brunchAssistantPage from "./ai-assistant.md?raw";

import type { PetrinautDocName } from "@hashintel/petrinaut-core";

/**
 * The user guide that Brunch's `readPetrinautDoc` tool reads. Brunch's own
 * copy describes its assistant; every other page is Petrinaut's.
 */
export const readUserGuidePage = (doc: PetrinautDocName): string =>
  doc === "ai-assistant" ? brunchAssistantPage : petrinautDocsContent[doc];

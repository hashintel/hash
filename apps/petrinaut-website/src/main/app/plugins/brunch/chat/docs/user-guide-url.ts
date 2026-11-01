const petrinautDocsUrl =
  "https://github.com/hashintel/hash/blob/main/libs/%40hashintel/petrinaut/docs";
const brunchAssistantPageUrl =
  "https://github.com/hashintel/hash/blob/main/apps/petrinaut-website/src/main/app/plugins/brunch/chat/docs/ai-assistant.md";

/**
 * Where a page of Brunch's user guide is published in the repository: Brunch's
 * own assistant page, or Petrinaut's page of that name.
 */
export const userGuidePageUrl = (docName: string): string =>
  docName === "ai-assistant"
    ? brunchAssistantPageUrl
    : `${petrinautDocsUrl}/${docName}.md`;

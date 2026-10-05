/** Which assistant plugin the demo installs first, and so uses by default. */
export type DefaultAssistant = "brunch" | "petrinaut-ai";

export const resolveDefaultAssistant = (
  configured: string | undefined,
): DefaultAssistant => {
  const selection = configured?.trim();
  if (selection === undefined || selection === "") return "petrinaut-ai";
  if (selection === "brunch" || selection === "petrinaut-ai") return selection;
  throw new Error(
    `VITE_PETRINAUT_DEFAULT_ASSISTANT must be "petrinaut-ai" or "brunch", received ${JSON.stringify(configured)}.`,
  );
};

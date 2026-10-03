/** Which assistant plugin the demo installs first, and so uses by default. */
export type DefaultAssistant = "brunch" | "stock";

export const resolveDefaultAssistant = (
  configured: string | undefined,
): DefaultAssistant => {
  const selection = configured?.trim();
  if (selection === undefined || selection === "") return "stock";
  if (selection === "brunch" || selection === "stock") return selection;
  throw new Error(
    `VITE_PETRINAUT_DEFAULT_ASSISTANT must be "stock" or "brunch", received ${JSON.stringify(configured)}.`,
  );
};

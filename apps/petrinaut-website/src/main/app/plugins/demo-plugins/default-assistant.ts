/** The assistant plugin the demo lists first, so the editor shows it until the user picks another. */
type DefaultAssistant = "brunch" | "petrinaut-ai";

/** Reads `VITE_PETRINAUT_DEFAULT_ASSISTANT`, where `stock` names Petrinaut AI. */
export const resolveDefaultAssistant = (
  configured: string | undefined,
): DefaultAssistant => {
  const selection = configured?.trim();
  if (selection === "brunch") return selection;
  if (
    selection === undefined ||
    selection === "" ||
    selection === "petrinaut-ai" ||
    selection === "stock"
  ) {
    return "petrinaut-ai";
  }
  throw new Error(
    `VITE_PETRINAUT_DEFAULT_ASSISTANT must be "petrinaut-ai", "brunch" or "stock", received ${JSON.stringify(configured)}.`,
  );
};

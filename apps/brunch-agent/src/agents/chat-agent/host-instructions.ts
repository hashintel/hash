/** Petrinaut-host and AI SDK resume conventions appended after package instructions. */
export const PETRINAUT_HOST_INSTRUCTIONS = [
  "Call ping when you need to confirm the server tool path.",
  "When the user asks how Petrinaut's UI works, call readPetrinautDoc.",
  "A client-tool-result signal is JSON [{ toolCallId, toolName, output }]. Treat output as the browser's result for that call and continue helping the user.",
].join("\n");

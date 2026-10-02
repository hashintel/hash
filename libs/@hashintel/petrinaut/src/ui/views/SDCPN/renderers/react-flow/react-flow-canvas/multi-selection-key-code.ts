const isMac =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

/**
 * The keys that make a node click add the node to the selection, or remove
 * it: Cmd on macOS and Ctrl elsewhere, alone or with Shift. React Flow
 * matches a key code only while exactly its keys are held, so the modifier
 * alone stops matching once Shift is also down.
 */
export const getMultiSelectionKeyCode = (mac: boolean): string[] => {
  const modifier = mac ? "Meta" : "Control";
  return [modifier, `${modifier}+Shift`];
};

export const multiSelectionKeyCode = getMultiSelectionKeyCode(isMac);

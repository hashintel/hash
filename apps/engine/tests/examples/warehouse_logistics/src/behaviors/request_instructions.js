/**
 * This function lets the agent read its next instruction,
 * and request additional instructions from the manager if needed.
 */
function behavior(state, context) {
  /**
   * This function determines whether adding a new item
   * would exceed an agents maximum weight.
   */
  function itemTooHeavy(newItem) {
    const newItemWeight = context.globals().weights[newItem];
    const newTotalWeight = newItemWeight + state.curr_weight;
    return newTotalWeight > state.max_weight;
  }

  // If I have at least one instruction in my queue, read it
  if (state.instructions.length) {
    const nextInstruction = state.instructions.shift();

    // If item will be too heavy to pick up, skip it
    if (
      itemTooHeavy(nextInstruction.item) &&
      nextInstruction.action === "pick.js"
    ) {
      return;
    }

    // Otherwise, set properties to fulfill instruction
    state.behaviors = ["approach.js", nextInstruction.action];
    state.target_destination = nextInstruction.destination;
    state.target_item = nextInstruction.item;

    return;
  }

  // If I don't, then request a new set from the manager
  if (!state.waiting) {
    state.addMessage("manager", "request_instructions", {});
    state.waiting = true; // wait for a response
  }

  // Handle new instructions
  let inc_instructions = context
    .messages()
    .filter((m) => m.type.includes("new_instructions"))
    .map((m) => m.data.instructions);

  if (inc_instructions.length) {
    // Begin processing the first instruction
    state.instructions = inc_instructions[0];
    const nextInstruction = state.instructions.shift();

    state.waiting = false;

    // If item will be too heavy to pick up, skip it
    if (
      itemTooHeavy(nextInstruction.item) &&
      nextInstruction.action === "pick.js"
    ) {
      return;
    }

    state.behaviors = ["approach.js", nextInstruction.action];
    state.target_destination = nextInstruction.destination;
    state.target_item = nextInstruction.item;
  }
}

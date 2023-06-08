/**
 * This behavior causes an agent to search for a nearby patch
 * with the most sugar, and handles movement, "eating" and dying.
 */
function behavior(state, context) {
  const messages = context.messages();

  if (!state.waiting) {
    // Find patches along the x or y axis from you in vision
    const visiblePatches = context.neighbors().filter((n) => {
      const isPatch = n.behaviors.includes("sugar_patch.js");
      const sameX = state.position[0] === n.position[0];
      const sameY = state.position[1] === n.position[1];
      return isPatch && (sameX || sameY);
    });

    // Find the patches with the most sugar in vision
    const maxSugar = visiblePatches.reduce(
      (max, curr) => (curr.sugar > max.sugar ? curr : max),
      { sugar: 0 },
    ).sugar;
    const maxPatches = visiblePatches.filter((p) => p.sugar === maxSugar);
    // Randomly choose one to move to
    const bestPatch = maxPatches[Math.floor(Math.random() * maxPatches.length)];

    // Move and send message to the patch to eat sugar
    state.position = bestPatch.position;
    state.addMessage(bestPatch.agent_id, "request", {});

    // Use up sugar by moving
    state.sugar -= state.metabolism;
  }

  // See if you received sugar from the patch
  if (messages.length) {
    if (messages[0].type === "delivery") {
      state.sugar += messages[0].data.sugar;
    }
  }

  // Remove agent if sugar falls to or below 0
  if (state.sugar <= 0) {
    state.addMessage("hash", "remove_agent", {
      agent_id: state.agent_id,
    });
  }

  // Set agent properties
  state.height = 1 + Math.log(state.sugar);
  state.waiting = !state.waiting;
}

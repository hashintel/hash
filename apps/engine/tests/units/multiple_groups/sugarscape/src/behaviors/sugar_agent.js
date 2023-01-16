const keys = {
  position: ["number"],
  waiting: "boolean",
  sugar: "number",
};

/**
 * This behavior causes an agent to search for a nearby patch
 * with the most sugar, and handles movement, "eating" and dying.
 */
function behavior(state, context) {
  const messages = context.messages();

  if (state == null) {
    throw Error("STATE IS NULL: " + JSON.stringify(state));
  }

  if (!Object.keys(state.__cols).includes("position")) {
    throw Error("" + JSON.stringify(Object.keys(state.__cols)));
  }
  // Get agent properties

  let position = state.position;
  let waiting = state.waiting;
  let sugar = state.sugar;

  if (!waiting) {
    // Find patches along the x or y axis from you in vision
    const visiblePatches = context.neighbors().filter((n) => {
      const isPatch = n.behaviors.includes("sugar_patch.js");
      const sameX = position[0] === n.position[0];
      const sameY = position[1] === n.position[1];
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
    if (bestPatch == null) {
      throw Error(
        "SEARCH_RADIUS " +
          state.search_radius +
          "\nNEIGHBORS: " +
          JSON.stringify(context.neighbors()) +
          "\nvisiblePatches: " +
          JSON.stringify(visiblePatches),
      );
    }
    position = bestPatch.position;
    state.addMessage(bestPatch.agent_id, "request", {});

    // Use up sugar by moving
    sugar -= state.get("metabolism");
  }

  // See if you received sugar from the patch
  if (messages.length) {
    if (messages[0].type === "delivery") {
      sugar += messages[0].data.sugar;
    }
  }

  // Remove agent if sugar falls to or below 0
  if (sugar <= 0) {
    state.addMessage("hash", "remove_agent", {
      agent_id: state.get("agent_id"),
    });
  }

  // Set agent properties
  state.height = 1 + Math.log(sugar);
  state.position = position;
  state.set("waiting", !waiting);
  state.set("sugar", sugar);

  return state;
}

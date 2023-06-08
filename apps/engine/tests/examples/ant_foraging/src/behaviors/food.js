/** This behavior causes a food agent to be "eaten". */
function behavior(state, context) {
  if (state.waiting) {
    state.waiting = false;
    return;
  }
  // Find nearby searching ants
  const ants = context
    .neighbors()
    .filter((n) => n.behaviors.includes("search.js"));

  if (ants.length) {
    // Tell the first ant found to eat me
    state.addMessage(ants[0].agent_id, "eat", {
      position: state.position,
    });
    state.waiting = true;
  }
}

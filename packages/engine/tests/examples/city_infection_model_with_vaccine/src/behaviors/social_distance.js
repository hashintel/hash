/**
 * This behavior lets a managing agent notify other agents
 * to begin social distancing.
 */
function behavior(state, context) {
  const { time_til_social_distancing } = context.globals();

  if (state.get("timestep") === time_til_social_distancing) {
    // Send message to each person agent
    context
      .neighbors()
      .filter((n) => n.behaviors.includes("infection.js"))
      .forEach((n) =>
        state.addMessage(n.agent_id, "start_social_distancing", {}),
      );
  }

  state.modify("timestep", (t) => t + 1);

  return state;
}

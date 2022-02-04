/**
 * This behavior causes the agent to send a vaccine to all
 * person neighbors at a certain time step.
 */
const behavior = (state, context) => {
  if (state.get("counter") === context.globals().vaccinate_step) {
    context
      .neighbors()
      .filter((n) => n.behaviors.includes("infection.js"))
      .map((n) => state.addMessage(n.agent_id, "vaccine", {}));
  }
};

/**
 * This behavior causes an agent to decide whether they will
 * accept a vaccine when it is offered to them.
 */
const behavior = (state, context) => {
  const vaccine_msg = context.messages().filter((m) => m.type === "vaccine");

  if (
    state.get("health_status") !== "infected" &&
    vaccine_msg.length > 0 &&
    Math.random() < context.globals().vaccine_uptake
  ) {
    state.set("health_status", "immune");
  }
};

/**
 * This behavior is a handler for social distancing behavior.
 */
function behavior(state, context) {
  const { chance_start_social_distancing } = context.globals();
  const received_messages = context
    .messages()
    .filter((m) => m.type === "start_social_distancing");

  // Begin social distancing with some likelihood
  if (
    received_messages.length > 0 &&
    Math.random() > chance_start_social_distancing
  ) {
    state.set("social_distancing", true);
  }
}

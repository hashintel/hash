/**
 * This behavior sends a "public service announcement"
 * to all other agents to improve their hygiene. It occasionally
 * sends incorrect information which actually reduces it.
 */
function behavior(state, context) {
  const { good_psa_freq, bad_psa_freq } = context.globals();

  // Send a psa randomly with good hygiene information
  if (Math.random() < good_psa_freq) {
    context.neighbors().forEach((n) =>
      state.addMessage(n.agent_id, "psa", {
        hygiene_change: 0.05,
      }),
    );
  }

  // Less frequently, send bad hygiene information
  if (Math.random() < bad_psa_freq) {
    context.neighbors().forEach((n) =>
      state.addMessage(n.agent_id, "psa", {
        hygiene_change: -0.05,
      }),
    );
  }
}

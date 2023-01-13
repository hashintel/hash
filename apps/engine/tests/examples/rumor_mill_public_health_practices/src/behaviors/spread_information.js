/**
 * This behavior causes the agent to spread information
 * about hygiene and government trust to its neighbors.
 */
function behavior(state, context) {
  const neighbors = context.neighbors();

  if (neighbors.length) {
    // Choose random neighbor to pass information to
    const randInd = Math.floor(Math.random() * neighbors.length);
    const random_neighbor = neighbors[randInd];

    // Spread information based on hygiene level
    const hygiene_change = state.hygiene > 0.5 ? 0.01 : -0.01;
    state.addMessage(random_neighbor.agent_id, "information", {
      hygiene_change: hygiene_change,
    });

    // If agent is very distrustful, spread that as well
    if (state.gov_trust < 0.3) {
      state.addMessage(random_neighbor.agent_id, "distrust", {
        trust_change: -0.02,
      });
    }
    // If agent is very trusting, spread that as well
    else if (state.gov_trust > 0.7) {
      state.addMessage(random_neighbor.agent_id, "trust", {
        trust_change: 0.02,
      });
    }
  }
}

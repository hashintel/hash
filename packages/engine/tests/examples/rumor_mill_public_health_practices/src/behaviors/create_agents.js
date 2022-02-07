/**
 * Create the initial state as a grid of agents.
 */
function behavior(state, context) {
  const { width, height, show_height } = context.globals();

  const area = width * height;

  // Create a grid of agents with heterogenous initial values
  let agents = Array(area)
    .fill()
    .map((_val, id) => ({
      position: [id % width, Math.floor(id / width)],
      color: "white",
      height: show_height ? 0 : 0.1,
      // rumors_heard: 0,
      // Initial hygiene scales from 0.375 to 0.625
      hygiene: Math.random() * 0.25 + 0.375,
      // Initial gov_trust scales from 0.2 to 0.8
      gov_trust: Math.random() * 0.6 + 0.2,
      behaviors: ["listen.js", "spread_information.js", "display.js"],
    }));

  agents.forEach((data) => state.addMessage("hash", "create_agent", data));
}

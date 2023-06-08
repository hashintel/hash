/**
 * This behavior causes the patch of sugar to grow and
 * respond to requests for sugar from agents.
 */
function behavior(state, context) {
  // Grow more sugar if below the max capacity
  if (state.sugar < state.max_sugar) {
    state.sugar += context.globals().growth_rate / 2;
  }

  // Check if any agents sent a request for sugar
  const requests = context.messages().filter((m) => m.type === "request");
  if (requests.length) {
    // Send all sugar to randomly selected agent
    const randInd = Math.floor(Math.random() * requests.length);
    state.addMessage(requests[randInd].from, "delivery", {
      sugar: state.sugar,
      position: state.position,
    });

    state.sugar = 0;
  }

  // Set the color based on the level of sugar
  state.rgb = [255, 128, (255 * state.sugar) / 5];
}

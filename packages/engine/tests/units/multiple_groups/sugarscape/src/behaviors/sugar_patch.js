const keys = {
  sugar: "number",
  max_sugar: "number",
  rgb: ["number"],
};

/**
 * This behavior causes the patch of sugar to grow and
 * respond to requests for sugar from agents.
 */
function behavior(state, context) {
  let sugar = state.get("sugar");

  // Grow more sugar if below the max capacity
  if (sugar < state.get("max_sugar")) {
    sugar += context.globals().growth_rate / 2;
  }

  // Check if any agents sent a request for sugar
  const requests = context.messages().filter((m) => m.type === "request");
  if (requests.length) {
    // Send all sugar to randomly selected agent
    const randInd = Math.floor(Math.random() * requests.length);
    state.addMessage(requests[randInd].from, "delivery", {
      sugar: sugar,
      position: state.get("position"),
    });

    sugar = 0;
  }

  state.set("sugar", sugar);

  // Set the color based on the level of sugar
  state.set("rgb", [255, 128, (255 * sugar) / 5]);

  return state;
}

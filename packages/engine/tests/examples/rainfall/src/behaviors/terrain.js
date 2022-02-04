/**
 * This behavior adjusts the height and color of the terrain
 * to match the number of raindrops that are currently on it.
 */
function behavior(state, context) {
  // Calculate # of raindrops on this position
  const raindrops = context
    .neighbors()
    .filter(
      ({ position }) => state.position.toString() === position.toString(),
    );

  // Set the displayed height based on # of raindrops
  state.height = state.true_height + 0.25 * raindrops.length;

  // Find raindrops that aren't moving anymore
  const still_raindrops = raindrops.filter((n) => n.still);

  if (still_raindrops.length) {
    // Add to the true_height to represent pooling raindrops
    state.true_height += 0.25 * still_raindrops.length;
    state.pooled = true;

    // Remove those raindrops that aren't moving from the simulation
    still_raindrops.map((r) =>
      state.addMessage("hash", "remove_agent", {
        agent_id: r.agent_id,
      }),
    );
  }

  // Change color if there are raindrops on the agent
  if (raindrops > 0 || state.pooled) {
    state.color = "blue";
  } else {
    state.color = "grey";
  }
}

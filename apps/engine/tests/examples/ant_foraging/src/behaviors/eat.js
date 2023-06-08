/**
 * This behavior causes an ant to "eat" a food agent and
 * switch to delivering it back to the nest.
 */
function behavior(state, context) {
  const new_messages = context.messages();

  // Only eat if food messages you that its nearby
  if (!new_messages.length) {
    return;
  }

  // Move to nearby food
  state.position = new_messages[0].data.position;

  // Switch to delivering
  state.behaviors = [
    "deliver.js",
    "wrap_angle.js",
    "@hash/move-in-direction/move_in_direction.rs",
  ];
  state.color = "red";

  // Remove the food agent
  state.addMessage("hash", "remove_agent", {
    agent_id: new_messages[0].from,
  });
}

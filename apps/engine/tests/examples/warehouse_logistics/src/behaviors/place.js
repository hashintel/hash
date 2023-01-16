/**
 * This behaivor lets the agent place items it is carrying
 * onto a dock.
 */
function behavior(state, context) {
  if (!state.carrying.includes(state.target_item)) {
    // If I'm not carrying the item I'm supposed to place, notify the manager and request new instructions
    state.addMessage("manager", "instruction_failed", {
      item: state.target_item,
      destination: state.target_destination,
      action: state.behaviors[1],
    });

    state.behaviors = ["request_instructions.js"];
    state.target_destination = null;
    state.target_item = null;

    return;
  }

  // If I'm waiting for a response to my "place" message
  if (state.waiting) {
    const successfulPlace = context
      .messages()
      .filter((m) => m.type === "successful_place");

    if (successfulPlace.length) {
      // Remove the item I placed
      const placedItem = successfulPlace[0].data.item;
      const placedInd = state.carrying.indexOf(placedItem);
      state.carrying.splice(placedInd, 1);

      state.modify(
        "curr_weight",
        (w) => w - context.globals().weights[placedItem],
      );
      state.behaviors = ["request_instructions.js"];
      state.waiting = false;

      return;
    }
  }

  // If I'm next to target dock, place my item
  const nearbyDock = context
    .neighbors()
    .filter((n) => n.behaviors.includes("dock.js"));
  if (nearbyDock.length && !state.waiting) {
    state.addMessage(nearbyDock[0].agent_id, "place", {
      item: state.target_item,
    });

    state.waiting = true;
    state.direction = nearbyDock[0].position.map(
      (d, i) => d - state.position[i],
    );
    state.behaviors = ["place.js"];
  }
}

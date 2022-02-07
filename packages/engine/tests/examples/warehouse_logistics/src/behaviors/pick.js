/**
 * This behaivor lets the agent pick items off a shelf
 * and carry them.
 */
function behavior(state, context) {
  const in_messages = context.messages();

  if (state.waiting) {
    const successfulPicks = in_messages.filter(
      (m) => m.type === "successful_pick",
    );
    const failedPicks = in_messages.filter((m) => m.type === "failed_pick");

    // If you've succesfully picked
    if (successfulPicks.length) {
      // Carry the new item
      const pickedItem = successfulPicks[0].data.item;
      state.modify("carrying", (c) => c.concat(pickedItem));
      state.modify(
        "curr_weight",
        (w) => w + context.globals().weights[pickedItem],
      );

      state.waiting = false;
      // Check your next instructions
      state.behaviors = ["request_instructions.js"];
      state.target_item = null;
      state.target_destination = null;

      return;
    }

    if (failedPicks.length) {
      // Notify the manager the pick failed
      state.addMessage("manager", "pick_failed", {
        item: state.target_item,
        destination: state.target_destination,
        action: state.behaviors[1],
      });

      // Check next instructions
      state.behaviors = ["request_instructions.js"];
      state.target_item = null;
      state.target_destination = null;
      state.waiting = false;

      return;
    }
  }

  // Check if you're near your destination
  const position = state.position;
  const xClose = Math.abs(state.target_destination[0] - position[0]);
  const yClose = Math.abs(state.target_destination[1] - position[1]);

  if (xClose + yClose <= 1 && !state.waiting) {
    const correctShelf = context
      .neighbors()
      .filter(
        (n) =>
          n.behaviors.includes("shelf.js") &&
          n.position[0] === state.target_destination[0] &&
          n.position[1] === state.target_destination[1],
      );

    // Send a pick message if you are close to target shelf
    if (correctShelf.length) {
      state.addMessage(correctShelf[0].agent_id, "pick", {
        item: state.target_item,
      });

      state.waiting = true;
      state.direction = state.target_destination.map((d, i) => d - position[i]);
      state.behaviors = ["pick.js"];
    }
  }
}

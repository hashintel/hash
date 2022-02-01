/**
 * This behavior lets the manager respond to requests
 * for new instructions.
 */
function behavior(state, context) {
  const requests = context
    .messages()
    .filter((m) => m.type === "request_instructions");
  const dock_positions = context.globals().dock_positions;

  const shelves = context
    .neighbors()
    .filter((n) => n.behaviors.includes("shelf.js") && n.color !== "gray");

  requests.forEach((req) => {
    if (shelves.length === 0) {
      throw new Error("_HASH_PRIVATE_TEMPORARY_COMPLETE_ERROR");
    }

    // Choose two full shelves at random
    const randInd1 = Math.floor(Math.random() * shelves.length);
    const shelf1 = shelves[randInd1];

    const randInd2 = Math.floor(Math.random() * shelves.length);
    const shelf2 = shelves[randInd2];

    const randDock = Math.floor(Math.random() * dock_positions.length);

    // Send instructions to requesting agent
    state.addMessage(req.from, "new_instructions", {
      instructions: [
        {
          item: shelf1.stock[0],
          destination: shelf1.position,
          action: "pick.js",
        },
        {
          item: shelf2.stock[0],
          destination: shelf2.position,
          action: "pick.js",
        },
        {
          item: shelf1.stock[0],
          destination: dock_positions[randDock],
          action: "place.js",
        },
        {
          item: shelf2.stock[0],
          destination: dock_positions[randDock],
          action: "place.js",
        },
      ],
    });
  });
}

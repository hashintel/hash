/**
 * This behavior creates food piles.
 */
function behavior(state, context) {
  let [x, y] = state.position;

  // Create template pile
  const foodArray = Array(25)
    .fill()
    .map((_, ind) => [ind % 5, Math.floor(ind / 5)]);

  // Generate a pile of food with bottom left corner at [x,y]
  let foodLocs = foodArray.map((loc) => [loc[0] + x, loc[1] + y]);
  foodLocs = foodLocs.concat([
    [x + 1, y - 1],
    [x + 2, y - 1],
    [x + 3, y - 1],
    [x + 1, y + 5],
    [x + 2, y + 5],
    [x + 3, y + 5],
  ]);
  foodLocs = foodLocs.concat([
    [x - 1, y + 1],
    [x - 1, y + 2],
    [x - 1, y + 3],
    [x + 5, y + 1],
    [x + 5, y + 2],
    [x + 5, y + 3],
  ]);

  // Send message to create food agents
  foodLocs.map((loc) =>
    state.addMessage("hash", "create_agent", {
      height: 1,
      behaviors: ["food.js"],
      color: "green",
      waiting: false,
      position: loc,
      search_radius: 1,
    }),
  );
}

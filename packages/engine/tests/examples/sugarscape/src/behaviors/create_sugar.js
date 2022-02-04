/**
 * This behavior creates sugar patches based on a 50x50
 * dataset describing the maximum sugar values at each
 * point in the grid.
 */
function behavior(state, context) {
  // Import the dataset
  const sugarRows = context.data()["@hash/sugarscape-map/50x50.csv"];

  sugarRows.forEach((row, pos_x) => {
    row.forEach((cell, pos_y) =>
      state.addMessage("HASH", "create_agent", {
        position: [pos_x, pos_y], // based on location in dataset
        max_sugar: parseInt(cell), // based on value in data
        sugar: parseInt(cell),
        height: 1,
        rgb: [255, 128, (255 * cell) / 5],
        behaviors: ["sugar_patch.js"],
      }),
    );
  });
}

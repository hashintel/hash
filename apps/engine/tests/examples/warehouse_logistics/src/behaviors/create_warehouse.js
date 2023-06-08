/**
 * This behavior creates the shelves, docks and workers.
 */
function behavior(state, context) {
  const { layout, dock_positions } = context.globals();

  /** Return a list of shelf agents in a vertical line */
  function createColumn(x, y, len, stock) {
    const column = Array(len)
      .fill()
      .map((_, ind) => ({
        behaviors: ["shelf.js"],
        position: [x, y + ind],
        stock: [stock],
        color: stock === "apple" ? "red" : "yellow",
        height: 1.5,
        shape: "crate",
      }));

    return column;
  }

  /** Return a list of shelf agents in horizontal line */
  function createRow(x, y, len, stock) {
    const row = Array(len)
      .fill()
      .map((_, ind) => ({
        behaviors: ["shelf.js"],
        position: [x + ind, y],
        stock: [stock],
        color: stock === "apple" ? "red" : "yellow",
        height: 1.5,
        shape: "crate",
      }));

    return row;
  }

  // Define the shelves
  const shelves = [];
  if (layout === "columns") {
    Array(4)
      .fill()
      .map((_, ind) => shelves.push(...createColumn(4 * ind, 0, 5, "apple")));
    Array(4)
      .fill()
      .map((_, ind) =>
        shelves.push(...createColumn(4 * ind + 1, 0, 5, "banana")),
      );

    Array(4)
      .fill()
      .map((_, ind) => shelves.push(...createColumn(4 * ind, 7, 5, "apple")));
    Array(4)
      .fill()
      .map((_, ind) =>
        shelves.push(...createColumn(4 * ind + 1, 7, 5, "banana")),
      );
  } else if (layout === "rows") {
    Array(2)
      .fill()
      .map((_, ind) => shelves.push(...createRow(0, 4 * ind + 3, 10, "apple")));
    Array(2)
      .fill()
      .map((_, ind) =>
        shelves.push(...createRow(12, 4 * ind + 3, 10, "apple")),
      );

    Array(2)
      .fill()
      .map((_, ind) =>
        shelves.push(...createRow(0, 4 * ind + 4, 10, "banana")),
      );
    Array(2)
      .fill()
      .map((_, ind) =>
        shelves.push(...createRow(12, 4 * ind + 4, 10, "banana")),
      );
  }

  // Define the workers
  const workers = [
    {
      behaviors: ["request_instructions.js"],
      position: [-2, 9],
      carrying: [],
      instructions: [],
      color: "green",
      go_around: "",
      curr_weight: 0,
      max_weight: 3,
      height: 2,
      shape: "forklift",
      scale: [1.5, 1.5],
      waiting: false,
      prev_direction: [0, 0, 0],
      dy: 1,
      dx: 1,
    },
    {
      behaviors: ["request_instructions.js"],
      position: [-2, 3],
      carrying: [],
      instructions: [],
      color: "green",
      go_around: "",
      curr_weight: 0,
      max_weight: 3,
      height: 2,
      shape: "forklift",
      scale: [1.5, 1.5],
      waiting: false,
      prev_direction: [0, 0, 0],
      dy: 1,
      dx: 1,
    },
  ];

  // Define the docks
  const docks = [
    {
      behaviors: ["dock.js"],
      position: dock_positions[0],
      color: "purple",
      shape: "conveyor",
      scale: [3, 3, 2],
      height: 3,
      stock: [],
    },
    {
      behaviors: ["dock.js"],
      position: dock_positions[1],
      color: "purple",
      shape: "conveyor",
      scale: [3, 3, 2],
      height: 3,
      stock: [],
    },
  ];

  // Define the manager agent
  const manager = {
    agent_name: "manager",
    search_radius: 50,
    position: [8, 4, -2],
    behaviors: ["manager_neighbors.js"],
  };

  const agents = [...workers, ...shelves, ...docks, manager];

  // Create the agents
  agents.forEach((a) => state.addMessage("hash", "create_agent", a));
}

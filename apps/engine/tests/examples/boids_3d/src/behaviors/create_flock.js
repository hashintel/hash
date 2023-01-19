/**
 * This behavior generates a set number of boid agents
 * with random color and initial direction.
 */
function behavior(state, context) {
  // dimension can be set to either 3 or 2 in globals.json
  const { dimension, agent_count } = context.globals();

  /** Returns a random normalized vector */
  const randomVec = () => {
    const vec = Array(dimension)
      .fill()
      .map(() => Math.random() - 0.5);
    const magnitude = Math.sqrt(vec.reduce((acc, val) => acc + val ** 2, 0));

    return vec.map((v) => v / magnitude); // normalize the vector
  };

  /** Returns a random RGB color */
  const randomColor = () => {
    return Array(3)
      .fill()
      .map(() => Math.floor(Math.random() * 255));
  };

  const width = 10;
  Array(agent_count)
    .fill()
    .map((_val, id) => {
      // Tell the HASH engine to create the boid agents
      state.addMessage("HASH", "create_agent", {
        position: [id % width, Math.floor(id / width), 1],
        direction: randomVec(),
        behaviors: ["flock.js"],
        rgb: randomColor(),
        shape: "bird",
      });
    });
}

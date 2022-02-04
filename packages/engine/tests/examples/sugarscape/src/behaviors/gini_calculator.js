function behavior(state, context) {
  /** This function returns the sum of an array. */
  function sum(array) {
    return array.reduce((a, b) => a + b, 0);
  }

  function sorter(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  // Find all agents
  const agents = context
    .neighbors()
    .filter((n) => n.behaviors.includes("sugar_agent.js"));

  const sugar_array = agents
    .map((a) => a.sugar)
    .filter((s) => s > 0)
    .sort(sorter);
  const n = sugar_array.length;
  const mod_ranks = [...Array(n).keys()].map((a) => 2 * (a + 1) - n - 1);

  const ranks_multiply = mod_ranks.map((r, ind) => r * sugar_array[ind]);

  state.gini_value = sum(ranks_multiply) / (n * sum(sugar_array));
}

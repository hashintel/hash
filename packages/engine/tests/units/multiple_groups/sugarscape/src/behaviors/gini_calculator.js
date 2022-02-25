const keys = {
  gini_value: "number",
};

/** T */
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

  if (context.step() === 2) {
    throw new Error(
      JSON.stringify(
        context.neighbors().map((n) => [n.__loc, n._HIDDEN_0_previous_index]),
      ),
    );
  }

  const agents = context.neighbors().filter((n) => {
    // if (context.step() === 2 && n === undefined) {
    //   throw Error("WAT");
    // }
    // try {
    return n.behaviors.includes("sugar_agent.js");
    // }
    // catch {
    //   throw Error(JSON.stringify(n))
    // }
  });

  const sugar_array = agents
    .map((a) => a.sugar)
    .filter((s) => s > 0)
    .sort(sorter);
  const n = sugar_array.length;
  const mod_ranks = [...Array(n).keys()].map((a) => 2 * (a + 1) - n - 1);

  const ranks_multiply = mod_ranks.map((r, ind) => r * sugar_array[ind]);

  const curr_gini = sum(ranks_multiply) / (n * sum(sugar_array));
  state.set("gini_value", curr_gini);

  return state;
}

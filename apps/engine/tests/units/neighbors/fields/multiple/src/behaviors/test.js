/**
 * Accesses each neighbor's field `value` pushing it to the relevant list
 *
 * This ensures, that only specific agents are accessed
 */
const behavior = (state, context) => {
  context.neighbors().forEach((neighbor) => {
    switch (neighbor.agent_name) {
      case "a":
        state.value_a.push(neighbor.value);
        break;
      case "b":
        state.value_b.push(neighbor.value);
        break;
      case "c":
        state.value_c.push(neighbor.value);
        break;
    }
  });
};

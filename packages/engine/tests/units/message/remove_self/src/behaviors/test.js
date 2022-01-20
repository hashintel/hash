/**
 * Remove this agent from the simulation
 */
const behavior = (state, context) => {
  state.messages = [
    {
      to: "hash",
      type: "remove_agent",
    },
  ];
};

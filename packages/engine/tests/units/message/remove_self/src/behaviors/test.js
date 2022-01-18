/**
 * Remove the three specified agents
 */
const behavior = (state, context) => {
  state.messages = [
    {
      to: "hash",
      type: "remove_agent",
    },
  ];
};

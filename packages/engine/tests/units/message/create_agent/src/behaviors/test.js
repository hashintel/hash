/**
 * Creates three new agents
 */
const behavior = (state, context) => {
  state.messages = [
    {
      to: "hash",
      type: "create_agent",
      data: {
        agent_name: "0",
      },
    },
    {
      to: "HASH",
      type: "create_agent",
      data: {
        agent_name: "1",
      },
    },
    {
      to: "Hash",
      type: "create_agent",
      data: {
        agent_name: "2",
      },
    },
  ];
};

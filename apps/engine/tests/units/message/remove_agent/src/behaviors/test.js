/**
 * Remove the three specified agents
 */
const behavior = (state, context) => {
  state.messages = [
    {
      to: "hash",
      type: "remove_agent",
      data: {
        agent_id: "00000000-0000-0000-0000-000000000001",
      },
    },
    {
      to: "HASH",
      type: "remove_agent",
      data: {
        agent_id: "00000000-0000-0000-0000-000000000002",
      },
    },
    {
      to: "Hash",
      type: "remove_agent",
      data: {
        agent_id: "00000000-0000-0000-0000-000000000003",
      },
    },
  ];
};

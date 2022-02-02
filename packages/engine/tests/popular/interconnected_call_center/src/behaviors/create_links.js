/**
 * @param {AgentState} state
 * @param {AgentContext} context
 */
const generateLink = (agent_a, agent_b, links_capacity) => {
  //Generate a link capacity at random
  const capacity =
    Math.round(Math.random() * (links_capacity.max - links_capacity.min)) +
    links_capacity.min;
  const available = capacity !== 0 ? true : false;

  //Tag every link with a standard agent ID
  const agent_id = hash_stdlib.generateAgentID();

  //Create a link between the two call centers
  const pos_a = agent_a.position;
  const pos_b = agent_b.position;

  const dx = pos_a[0] - pos_b[0];
  const dy = pos_a[1] - pos_b[1];
  const dx2 = dx ** 2;
  const dy2 = dy ** 2;

  const norm = (dx2 + dy2) ** 0.5;
  const mid_x = (pos_a[0] + pos_b[0]) / 2;
  const mid_y = (pos_a[1] + pos_b[1]) / 2;

  //Create the link agent object, using parameters defined in HASH
  link = {
    agent_id,
    capacity,
    available,
    sent: 0,
    scale: [norm, 0.1, 0.1],
    height: 0.1,
    rgb: [0, 0, 255],
    center_1: agent_a.agent_id,
    center_2: agent_b.agent_id,
    position: [mid_x, mid_y],
    direction: [2 * dy, -2 * dx],
    behaviors: ["link_transfer.js"],
  };
  return link;
};

//Set up the call center links
const behavior = (state, context) => {
  const { links_capacity } = context.globals();

  state.agents["links"] = [];

  for (let i = 0; i < state.agents["call_centers"].length; i++) {
    for (let j = i + 1; j < state.agents["call_centers"].length; j++) {
      //Create a link between call center agent i and agent j
      link = generateLink(
        state.agents["call_centers"][i],
        state.agents["call_centers"][j],
        links_capacity,
      );

      //Store a reference to the link agents
      state.agents["links"].push(link);
      state.agents["call_centers"][i].links.push(link.agent_id);
      state.agents["call_centers"][j].links.push(link.agent_id);
    }
  }
};

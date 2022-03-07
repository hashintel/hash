const init = (context) => {
  var agents = [];
  for (var i = 0; i < context.globals().num_agents; ++i) {
    agents.push({
      agent_id: "00000000-0000-0000-0000-" + String(i + 1).padStart(12, "0"),
      behaviors: ["age.js"],
      age: 0,
    });
  }
  return agents;
};

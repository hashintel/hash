/**
 * @param {AgentState} state
 * @param {AgentContext} context
 */

//Use the hash random library to generate call centers from global variables
const generate_call_center = (
  template,
  angle,
  n_call_centers,
  call_distribution,
  skill_level,
  operators,
) => {
  let call_center = {
    ...template,
    agent_id: hash_stdlib.generateAgentID(),
    call_generation: [
      call_distribution.min / n_call_centers,
      call_distribution.mean / n_call_centers,
      call_distribution.max / n_call_centers,
    ],
    skill_level:
      Math.random() * (skill_level.max - skill_level.min) + skill_level.min,
    operators:
      Math.floor(Math.random() * (operators.max - operators.min)) +
      operators.min,
    position: [
      n_call_centers * Math.cos(angle),
      n_call_centers * Math.sin(angle),
    ],
    search_radius: n_call_centers * 2,
  };

  return call_center;
};

//Set up a ring of n call centers and randomly generate variables
const behavior = (state, context) => {
  const { n_call_centers, call_distribution, skill_level, operators } =
    context.globals();

  let call_centers = [];
  let call_center_template = state.call_center_template;

  for (let i = 0; i < n_call_centers; i++) {
    //Generate call centers in a circle
    let angle = (i * Math.PI * 2.0) / n_call_centers;
    let call_center = generate_call_center(
      call_center_template,
      angle,
      n_call_centers,
      call_distribution,
      skill_level,
      operators,
    );

    call_centers.push(call_center);
  }

  state.agents["call_centers"] = call_centers;
};

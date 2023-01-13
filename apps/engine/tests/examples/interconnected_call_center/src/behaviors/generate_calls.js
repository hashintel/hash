/**
 * @param {AgentState} state
 * @param {AgentContext} context
 */

//Use the hash random library to randomly sample a call duration
const generateDurationForAgent = (mean_call_duration, skill_level) => {
  const min = 2 * (mean_call_duration / skill_level);
  const max = 3 * (mean_call_duration / skill_level);
  duration = Math.round(Math.random() * (max - min) + min);
  return duration;
};

//For each call center, generate a set of random calls by sampling a distribution
const behavior = (state, context) => {
  const { mean_call_duration } = context.globals();

  if (state.counter !== 0) {
    return;
  }

  const calls_generated = hash_stdlib.stats.triangular.sample(
    ...state.call_generation,
  );

  for (let i = 0; i < Math.round(calls_generated); i++) {
    const call = {
      duration: generateDurationForAgent(mean_call_duration, state.skill_level),
      wait_time: 0,
      origin: state.agent_id,
    };

    state.call_queue.push(call);
  }
};

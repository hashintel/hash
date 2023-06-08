/**
 * @param {AgentState} state
 * @param {AgentContext} context
 */
const behavior = (state, context) => {
  const ms = context.messages();
  const success = ms.filter((m) => m.type === "call_success");
  state.sent -= success.length;

  // Handle incoming call transfers
  const external_calls = ms.filter((m) => m.type === "external_call");

  let index = 0;
  while (state.sent < state.capacity && index < external_calls.length) {
    if (external_calls[index].from === state.center_1) {
      state.addMessage(state.center_2, "external_call", {
        ...external_calls[index].data,
        link_return: state.agent_id,
      });
    } else {
      state.addMessage(state.center_1, "external_call", {
        ...external_calls[index].data,
        link_return: state.agent_id,
      });
    }

    index++;
    state.sent++;
  }

  //Balk calls if the capacity if full
  if (index < external_calls.length) {
    for (let i = index; i < external_calls.length; i++) {
      state.addMessage(external_calls[index].from, "balked_call");
    }
  }

  if (state.sent === state.capacity) {
    state.available = false;
  }

  // // Visuals
  const color_proportion = state.sent / state.capacity;
  if (!color_proportion) {
    state.rgb = [0, 0, 0];
  } else {
    state.rgb = [255 * color_proportion, 0, 255];
  }

  if (state.sent < state.capacity) {
    state.available = true;
  }
};

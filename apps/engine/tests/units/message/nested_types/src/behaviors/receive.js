/**
 * Reads messages and stores them into the agent's state
 */
const behavior = (state, context) => {
  const messages = context.messages();

  if (messages.length > 0) {
    const data = messages[0].data;

    state.struct = data.struct;
  }
};

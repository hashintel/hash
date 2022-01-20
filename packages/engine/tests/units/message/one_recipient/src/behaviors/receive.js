/**
 * Sets `state.received` if a message arrived
 */
const behavior = (state, context) => {
  if (context.messages().length > 0) {
    state.received = true;
  } else {
    state.received = false;
  }
};

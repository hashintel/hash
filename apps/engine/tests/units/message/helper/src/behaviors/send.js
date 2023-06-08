/**
 * Sends an empty message "test" to "1"
 */
const behavior = (state, context) => {
  state.addMessage("1", "test", {});
};

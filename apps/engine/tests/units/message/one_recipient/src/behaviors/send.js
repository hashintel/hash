/**
 * Sends an empty message "test" to "1"
 */
const behavior = (state, context) => {
  state.messages = [
    {
      to: "1",
      type: "test",
      data: {},
    },
  ];
};

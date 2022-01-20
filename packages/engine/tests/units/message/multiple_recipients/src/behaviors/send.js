/**
 * Sends an empty message "test" to "1" and "2"
 */
const behavior = (state, context) => {
  state.messages = [
    {
      to: ["1", "2"],
      type: "test",
      data: {},
    },
  ];
};

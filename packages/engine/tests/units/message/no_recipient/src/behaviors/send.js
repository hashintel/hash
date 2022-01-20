/**
 * Sends an empty message "test" to no-one
 */
const behavior = (state, context) => {
  state.messages = [
    {
      to: [],
      type: "test",
      data: {},
    },
  ];
};

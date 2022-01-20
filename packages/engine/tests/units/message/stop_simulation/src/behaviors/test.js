/**
 * Stops the simulation at step 2
 */
const behavior = (state, context) => {
  if (context.step() === 2) {
    state.messages = [
      {
        to: "hash",
        type: "stop",
        data: {
          status: "success",
          reason: "test",
        },
      },
    ];
  }
};

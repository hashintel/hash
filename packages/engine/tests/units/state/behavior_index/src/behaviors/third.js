/**
 * Checks `state.index` to be equal to `state.behaviorIndex()`
 */
const behavior = (state, context) => {
  if (state.behaviorIndex() !== state.index) {
    state.valid = false;
  }

  state.index += 1;
};

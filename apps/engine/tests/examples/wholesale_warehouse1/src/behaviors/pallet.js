/**
 * @param {AgentState} state
 * @param {AgentContext} context
 */
const behavior = (state, context) => {
  const messages = context.messages();

  /**
   * --- Delivered ---
   */
  const delivery_messages = messages
    .filter((m) => m.type === "delivery")
    .map((m) => m.data);
  if (delivery_messages.length) {
    state.position = delivery_messages[0].position;
  }

  /**
   * --- Picked Up ---
   */
  const pickup_messages = messages.filter((m) => m.type === "pickup");
  if (pickup_messages.length) {
    state.position = null;
  }
};

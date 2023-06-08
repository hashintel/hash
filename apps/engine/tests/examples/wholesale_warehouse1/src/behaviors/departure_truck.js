const behavior = (state, context) => {
  /**
   * --- Collect Pallets (for Orders) ---
   */
  const delivery_messages = context
    .messages()
    .filter((m) => m.type === "delivery")
    .map((m) => m.data);
  if (delivery_messages.length) {
    state.addMessage("hash", "remove_agent", {
      agent_id: delivery_messages[0].id,
    });

    state.orders_complete += 1;
  }
};

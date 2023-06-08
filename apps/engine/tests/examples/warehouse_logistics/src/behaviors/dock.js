/**
 * This behavior allows the dock to receive items.
 */
function behavior(state, context) {
  const placeMessages = context.messages().filter((m) => m.type === "place");

  placeMessages.map((m) => {
    // Add placed item to stock
    state.stock.push(m.data.item);

    // Notify worker and manager agents
    state.addMessage(m.from, "successful_place", {
      item: m.data.item,
    });
    state.addMessage("manager", "stock_update", {
      position: state.get("position"),
      item: m.data.item,
    });
  });

  state.stock_amount = state.stock.length;
}

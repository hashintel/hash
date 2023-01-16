/**
 * This behavior lets the agent handle pick and place
 * requests, and adjusts the display properties of the agent.
 */
function behavior(state, context) {
  // Receive pick and place messages
  const in_messages = context.messages();
  const pickMessages = in_messages.filter((m) => m.type === "pick");
  const placeMessages = in_messages.filter((m) => m.type === "place");

  // Handle pick requests
  pickMessages.map((m) => {
    const itemIndex = state.stock.indexOf(m.data.item);
    if (itemIndex === -1) {
      // If I don't have the item, notify the worker
      state.addMessage(m.from, "failed_pick", {
        item: m.data.item,
      });
    } else {
      // If I have the item, remove from stock and send to worker
      state.stock.splice(itemIndex, 1);
      state.addMessage(m.from, "successful_pick", {
        item: m.data.item,
      });
    }
  });

  // Handle place requests
  placeMessages.map((m) => {
    if (state.stock.length > state.max_items) {
      // If I'm already full, return item to the worker
      state.addMessage(m.from, "failed_place", {
        item: m.data.item,
      });
    } else {
      // If I have room, add the item to my stock and notify worker and manager agent
      state.stock.push(m.data.item);
      state.addMessage(m.from, "successful_place", {
        item: m.data.item,
      });
      state.addMessage("manager", "stock_update", {
        position: state.position,
        item: m.data.item,
      });
    }
  });

  // Set height and color based on stock

  if (!state.stock.length) {
    state.hidden = true;
  } else {
    state.height = state.stock.length;
  }

  if (state.stock.includes("apple")) {
    state.color = "red";
  } else if (state.stock.includes("banana")) {
    state.color = "yellow";
  } else {
    state.color = "gray";
  }
}

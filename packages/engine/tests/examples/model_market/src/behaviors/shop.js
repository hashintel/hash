/**
 * This behavior handles shops opening and closing
 * and adjusting their prices in response to buyers.
 */
function shutDownClosed(state) {
  // Cost exceeds price, so shut down
  if (state.cost > state.price) {
    state.color = "white";
  }
}

function reOpenClosed(state, globals) {
  // Random chance for new shop to open
  state.color = Math.random() < globals.startup_rate ? "skyblue" : "white";

  // If the shop is now open, set random price and cost
  if (state.color === "skyblue") {
    state.price =
      Math.floor(Math.random() * globals.max_price) + globals.min_price;
    state.cost =
      Math.floor(Math.random() * globals.max_cost) + globals.min_cost;
  }
}

function lowerPrices(current_buyers, state) {
  // If open and there was a sale last step (green)
  // but no sale this step
  if (current_buyers === 0) {
    // chance to lower price
    state.price *= Math.random() < 0.1 ? 0.85 : 1;

    if (Math.random() < 0.01) {
      state.color = "skyblue";
    }
  }
}

function behavior(state, context) {
  const globals = context.globals();

  shutDownClosed(state);

  // Currently closed shops
  if (state.color === "white") {
    reOpenClosed(state, globals);
    return;
  }

  // Check if any current buyers at current patch have purchased from the shop
  const current_buyers = context
    .neighbors()
    .filter(
      (n) =>
        n.position[0] === state.position[0] &&
        n.position[1] === state.position[1] &&
        n.purchased,
    ).length;

  // Open shops with no recent sales (blue)
  if (state.color === "skyblue") {
    // If there was a purchase
    if (current_buyers > 0) {
      state.color = "green";
    } else {
      // If there was no purchase, chance to lower price
      state.price *= Math.random() < 0.15 ? 0.85 : 1;

      // and chance of closing
      state.color =
        Math.random() < globals.closing_chance ? "white" : "skyblue";
    }

    return;
  }

  lowerPrices(current_buyers, state);
}

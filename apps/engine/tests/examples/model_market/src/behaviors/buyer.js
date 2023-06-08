/**
 * This behavior causes the agent to look around for shops
 * and find the one with the lowest price to shop at.
 */

function windowShop(current_shop, state) {
  // Window Shopping: look for the lowest price
  if (current_shop.color !== "white" && !state.can_buy) {
    state.window_shopping_counter -= 1;
    if (state.lowest_price === 0) {
      state.lowest_price = current_shop.price;
    } else {
      // Set a new lowest price if its lower
      state.lowest_price =
        current_shop.price < state.lowest_price
          ? current_shop.price
          : state.lowest_price;
    }
  }
}

function count_shopping(state, window_shopping_steps) {
  // Once my window shopping time runs out I can try and buy
  if (state.window_shopping_counter === 0) {
    state.can_buy = true;
    state.window_shopping_counter =
      Math.floor(Math.random() * window_shopping_steps) + 1;
  }
}

function behavior(state, context) {
  state.purchased = false;

  // Find the shop on my location
  const current_shop = context
    .neighbors()
    .filter(
      (n) =>
        n.position[0] === state.position[0] &&
        n.position[1] === state.position[1],
    )[0];

  windowShop(current_shop, state);
  count_shopping(state, context.globals().window_shopping_steps);

  // If the shop is open and I can buy, do so
  if (
    current_shop.color !== "white" &&
    state.can_buy &&
    current_shop.price <= state.lowest_price
  ) {
    state.purchased = true;
    state.can_buy = false;
    state.lowest_price = 0;
  }
}

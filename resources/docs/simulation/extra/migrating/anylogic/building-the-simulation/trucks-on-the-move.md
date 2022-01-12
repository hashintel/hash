---
title: Trucks on the Move
slug: simulation/extra/migrating/anylogic/building-the-simulation/trucks-on-the-move
objectId: caf5c3c1-c940-41a8-a21b-5ae15760c305
---

# Trucks on the Move

A few more agents will allow us to bring the oil all the way to its final location, the **Retailer**.

## Retailer

Our **Retailer** will need to consume oil based on some demand by consumers, and order more fuel from a **Distributor** when it's getting low.

```javascript
// demand.js

const behavior = (state, context) => {
  const { mean_gas_demand, seconds_per_step, reorder_level } =
    context.globals();
  const demand_rate =
    (0.5 + Math.random()) * mean_gas_demand * seconds_per_step;

  let oil = state.get("oil");

  if (oil - demand_rate > 0) {
    oil -= demand_rate;
  } else {
    oil = 0;
  }

  if (
    oil < (reorder_level * state.get("capacity")) / 100 &&
    !state.get("ordered")
  ) {
    // place an order
    state.set("order_quantity", 400);
    state.set("ordered", true);
  } else {
    state.set("order_quantity", 0);
  }

  state.set("oil", oil);
};
```

When `order_quantity` is set, two other custom behaviors we've written will trigger:

- `choose_order_from.js` - finds the nearest **Distributor** to order from
- `order.js` - places the order by sending a message

## Distributor

The **Distributor** now needs to respond to the order request, either by creating a fuel **Truck** to deliver oil or by responding with an out of stock message.

```javascript
// deliver.js

for (order of orders) {
  if (order.data.quantity < stock) {
    // reduce stock
    stock -= order.data.quantity;

    state.addMessage("hash", "create_agent", {
      position: state.get("position"),
      lng_lat: state.get("lng_lat"),
      destination_name: order.data.name,
      destination: order.data.lng_lat,
      color: "pink",
      behaviors: [
        "truck.js",
        "follow_route.js",
        "@hash/ll-to-pos/ll_to_pos.js",
      ],
      stock: order.data.quantity,
      shape: "car",
      scale: [0.3, 0.3, 0.3],
      route: [],
      route_step: 0,
      speed: (0.886 * seconds_per_step) / 3600,
      requested_route: false,
    });
  } else {
    state.addMessage(order.from, "no_stock");
  }
}
```

When we first write the code to create the truck, we might not know exactly what behaviors and properties it will have. We'll have to fully define the behaviors of the fuel **Truck**, and jump back to `deliver.js` to update the code here.

## Truck

We'll need to write one custom behavior for this agent, which will have to request a route from its current location to its destination, deliver its oil, and then reverse its route. Take a look at the [Navigating with Mapbox](/docs/simulation/creating-simulations/agent-messages/built-in-message-handlers#navigation-with-mapbox) section of the docs for an example of generating a real-world route. We'll use the published Follow Route behavior to move the Truck around our simulation.

We can detect when we've reached our destination in similar fashion to the **Tanker** agent, and deliver the oil using messages.

```javascript
// truck.js
// Deliver and reverse route
if (state.get("route_step") > route.length - 1) {
  if (state.get("returning") === true) {
    state.addMessage("hash", "remove_agent");
  } else {
    state.addMessage(state.get("destination_name"), "delivery", {
      quantity: state.get("stock"),
    });
    state.set("returning", true);
    state.set("route_step", 0);
    state.modify("route", (r) => r.reverse());
  }
}
```

Finally, the Retailer will need to accept the shipment of oil which the Truck deposits. We'll write a receive.js behavior to handle the delivery message the truck sends, and adjust its stock levels.

```javascript
const deliveries = context
  .messages()
  .filter((m) => m.type === "delivery")
  .reduce((acc, msg) => msg.data.quantity + acc, 0);

const out_of_stock = context.messages().filter((m) => m.type === "no_stock");

let oil = state.get("oil");

if (deliveries > 0 || out_of_stock.length > 0) {
  state.set("ordered", false);
}

oil += deliveries;
```

Once we've successfully tested this final step, we're done building all the behavioral logic to run this simulation!

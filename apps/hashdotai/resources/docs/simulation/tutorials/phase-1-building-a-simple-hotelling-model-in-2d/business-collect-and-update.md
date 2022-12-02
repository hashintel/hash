---
title: Business Collect and Update
slug: simulation/tutorials/phase-1-building-a-simple-hotelling-model-in-2d/business-collect-and-update
objectId: 62f732ca-a109-4c8b-8c07-40e3781199ff
---

# Business Collect and Update

The final step for this simulation is for the Businesses to collect the Customer replies and update their position and price to the combination that produced the largest profit. Create a `collect_customer_data()` function in `business.js` and add the following code.

```javascript
const collect_customer_data = (messages) => {
  let position_dictionary = {};

  messages
    .filter((message) => message.type === "customer_cost")
    .map((message) => {
      const position = JSON.stringify(message.data.position);
      const profit = JSON.parse(message.data.cost);
      const price = message.data.price;

      const position_price = JSON.stringify(position + price);

      if (position_price in position_dictionary) {
        position_dictionary[position_price].profit += profit;
      } else {
        position_dictionary[position_price] = {
          profit,
          price,
          position,
        };
      }
    });
};
```

Here we are filtering through customer messages and storing estimated profit in a dictionary based on price and position \(hence why we stringify ‘position + price’\).

Now all that remains is to iterate through the dictionary, find the key \(position and price\) with the largest profit value, and update the business agent. Place this code after filtering and mapping the customer data.

```javascript
let largest_profit = 0;
let new_position = state.position;
let new_price = state.item_price;

// Determine position with largest profit
Object.keys(position_dictionary).forEach((position_price) => {
  if (position_dictionary[position_price].profit > largest_profit) {
    largest_profit = position_dictionary[position_price].profit;
    new_position = JSON.parse(position_dictionary[position_price].position);
    new_price = position_dictionary[position_price].price;
  }
});

// Update business
state.position = new_position;
state.item_price = new_price;
```

Finally, call the collect_customer_data\(\) function with context.messages\(\).

```javascript
if (state.counter === 0) {
  query_customers(context.neighbors(), state.position);
} else if (state.counter === 2) {
  collect_customer_data(context.messages());
}
```

We want to give customers a step to reply so the function call is wrapped in an else if statement that collects the Customer data when the Business agent counter field is equal to 2.

Click Reset and Run!

You should see your Business agents start to move around to try and find the best position and price to make the largest profit. Customer agents will also continue to change their color based on their purchase preferences.

![](https://cdn-us1.hash.ai/site/docs/lc_p1.gif)

<Tabs>
<Tab title="business.js" >

```javascript
const behavior = (state, context) => {
  const send_message = (agent_id, position, price) => {
    state.addMessage(agent_id, "business_movement", {
      position,
      price,
      rgb: state.rgb,
    });
  };

  const price_messaging = (agent_id, position) => {
    const item_price = state.item_price;
    send_message(agent_id, position, item_price);
    send_message(agent_id, position, item_price + 1);
    if (item_price > 1) {
      send_message(agent_id, position, item_price - 1);
    }
  };

  const query_customers = (neighbors, state_position) => {
    const possible_movement = [
      [-1, 0],
      [0, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    neighbors
      .filter((neighbor) => neighbor.behaviors.includes("customer.js"))
      .forEach((neighbor) => {
        possible_movement.forEach((movement) => {
          const new_position = [
            state_position[0] + movement[0],
            state_position[1] + movement[1],
          ];
          price_messaging(neighbor.agent_id, new_position);
        });
      });
  };

  const collect_customer_data = (messages) => {
    let position_dictionary = {};

    messages
      .filter((message) => message.type === "customer_cost")
      .map((message) => {
        const position = JSON.stringify(message.data.position);
        const profit = JSON.parse(message.data.cost);
        const price = message.data.price;

        const position_price = JSON.stringify(position + price);

        if (position_price in position_dictionary) {
          position_dictionary[position_price].profit += profit;
        } else {
          position_dictionary[position_price] = {
            profit,
            price,
            position,
          };
        }
      });

    // console.log(state.position, position_dictionary);

    let largest_profit = 0;
    let new_position = state.position;
    let new_price = state.item_price;

    // Determine position with largest profit
    Object.keys(position_dictionary).forEach((position_price) => {
      if (position_dictionary[position_price].profit > largest_profit) {
        largest_profit = position_dictionary[position_price].profit;
        new_position = JSON.parse(position_dictionary[position_price].position);
        new_price = position_dictionary[position_price].price;
      }
    });

    // Update business
    state.position = new_position;
    state.item_price = new_price;
  };

  if (state.counter === 0) {
    query_customers(context.neighbors(), state.position);
  } else if (state.counter === 2) {
    collect_customer_data(context.messages());
  }
};
```

</Tab>
</Tabs>

---
title: Customer Reply
slug: simulation/tutorials/phase-1-building-a-simple-hotelling-model-in-2d/customer-reply
objectId: 91eaa467-7855-4948-adc0-5d325d839f4d
---

# Customer Reply

Now that Business agents are communicating with Customers, we need the Customers to send a reply back. To do this, let’s look at `customer.js`. Every time a Customer agent receives a batch of messages, it will:

- Run the message data through a cost function to determine the change with the lowest cost for each Business
- Notify each Business where they would choose to shop given all the possibilities
- “Purchase” from the Business with the overall lowest cost return

The cost function will be as follows, where price is the Business’s `item_price`, position is the Business’s `position`, and D is the distance function \(linear euclidean\) :

<Math formula="C(B_i)=price_i+D(position_i)" />

<Math formula="D(p) = \sqrt{p_x^2+p_y^2}" />

Create the function `calculate_cost()` in `customer.js`.

<Tabs>
<Tab title="customer.js" >

```javascript
const behavior = (state, context) => {
  // Function to determine cost --> Business price * distance from Business
  const calculate_cost = (position, price) => {
    const state_position = state.position;

    return (
      price +
      Math.sqrt(
        Math.pow(state_position[0] - position[0], 2) +
          Math.pow(state_position[1] - position[1], 2),
      )
    );
  };
};
```

</Tab>
</Tabs>

Next, we are going to collect and store all the messages sent by the Business agents into a dictionary. This will make for easy access and iteration when we compare. Place this code underneath `calculate_cost()`.

```javascript
const collect_business_data = (messages) => {
  let shops = {};

  messages
    .filter((message) => message.type === "business_movement")
    .forEach((message) => {
      const agent_id = message.from;

      if (agent_id in shops) {
        shops[agent_id].data.push([
          message.data.position,
          message.data.price,
          message.data.rgb,
        ]);
      } else {
        shops[agent_id] = {
          data: [[message.data.position, message.data.price, message.data.rgb]],
        };
      }
    });

  return shops;
};
```

Now that all the Business data is stored successfully, we need to iterate through each key \(or Business\) and determine which `position` and `item_price` combination yields the lowest cost for the individual Business as well as the overall.

Define a `find_min()` function like the one below.

```javascript
const find_min = (businesses) => {
  let overall_min = {
    cost: null,
    agent_id: "",
    position: [],
    price: 0,
    rgb: null,
  };

  Object.keys(businesses).forEach((shop) => {
    let individual_min = {
      cost: null,
      agent_id: "",
      position: [],
      price: 0,
      rgb: null,
    };

    // Find min cost for each business
    businesses[shop].data.forEach((business_change) => {
      const position = business_change[0];
      const price = business_change[1];
      const rgb = business_change[2];

      const cost = calculate_cost(position, price);
    });
  });
};
```

<Hint style="info">

- **overall_min →** store the data for the business position/price combination that yields the lowest cost across all businesses
- **Individual_min →** store the data for the business position/price combination that yields the lowest cost across for each individual business

</Hint>

Let’s add the cost comparisons for both the individual Business and overall. Place the following code right below your cost calculation \(within the`businesses[shop].data.forEach() call`\).

```javascript
// Check min for individual business
if (cost < individual_min.cost || individual_min.cost === null) {
  // TODO: Update individual_min
} else if (cost === individual_min.cost) {
  if (Math.random() < 0.5) {
    // TODO: Update individual_min
  }
}

// Check min for all business
if (cost < overall_min.cost || overall_min.cost === null) {
  // TODO: Update overall_min
} else if (cost === overall_min.cost) {
  // 50% chance of picking another business if cost is the same or will pick the shop they shopped at last tick
  if (
    Math.random() < 0.5 ||
    JSON.stringify(state.rgb) === JSON.stringify(rgb)
  ) {
    // TODO: Update overall_min
  }
}
```

Notice how many times you need to update `overall_min` and `individual_min`. Since both objects have the same structure and to save lines of code, let’s create another function in customer.js called `update_min()`. \(Add it before `find_min()`\).

```javascript
// Update properties of 'type' object (individual_min or overall_min)
const update_min = (type, cost, id, position, price, rgb) => {
  type.cost = cost;
  type.agent_id = id;
  type.position = position;
  type.price = price;
  type.rgb = rgb;
};
```

Now we can replace the ‘TODO’ comments with a call to update_min\(\) with the proper parameters. We've inserted those calls in the snippet below.

```javascript
// Check min for individual business
if (cost < individual_min.cost || individual_min.cost === null) {
  update_min(individual_min, cost, shop, position, price, rgb);
} else if (cost === individual_min.cost) {
  if (Math.random() < 0.5) {
    update_min(individual_min, cost, shop, position, price, rgb);
  }
}

// Check min for all business
if (cost < overall_min.cost || overall_min.cost === null) {
  update_min(overall_min, cost, shop, position, price, rgb);
} else if (cost === overall_min.cost) {
  // 50% chance of picking another business if cost is the same or will pick the shop they shopped at last tick
  if (
    Math.random() < 0.5 ||
    JSON.stringify(state.rgb) === JSON.stringify(rgb)
  ) {
    update_min(overall_min, cost, shop, position, price, rgb);
  }
}
```

After all the comparisons have been made, we want to notify that particular Business where this Customer would prefer to shop. Let's send a message just below the `businesses[shop].data.forEach()` call within the key iterator.

```javascript
state.addMessage(individual_min.agent_id, "customer_cost", {
  cost: individual_min.cost,
  position: individual_min.position,
  price: individual_min.price,
});
```

All that’s left to do now for `customer.js` is to update the agent’s color to the `overall_min`’s color. This signifies that the Customer decided it would want to purchase from that particular business. Set the agent’s color after the closing of the object key iterator \(on line 89\).

```javascript
// Only update color if min cost was determined during this time step
if (overall_min.rgb !== null) {
  state.rgb = overall_min.rgb;
}
```

Finally, call find_min\(\) below your call to collect_business_data\(\) and pass in the const variable `businesses`.

```javascript
const businesses = collect_business_data(context.messages());
find_min(businesses);
```

The `customer.js` behavior is finally complete!

<Hint style="success">
To see **customer.js** in full, navigate to bottom of this section or click on ‘**Phase 1** **Final Code**’ in the sidebar.
</Hint>

Reset and run!

If you followed all the steps above, run the simulation a couple times and you should see the customer agents change color based on their decision after a couple time steps.

![](https://cdn-us1.hash.ai/site/docs/lc_p2_customers.gif)

<Tabs>
<Tab title="customer.js" >

```javascript
const behavior = (state, context) => {
  // Function to determine cost --> business price + distance from business
  const calculate_cost = (position, price) => {
    const state_position = state.position;
    return (
      price +
      Math.sqrt(
        Math.pow(state_position[0] - position[0], 2) +
          Math.pow(state_position[1] - position[1], 2),
      )
    );
  };

  const collect_business_data = (messages) => {
    let shops = {};
    messages
      .filter((message) => message.type === "business_movement")
      .forEach((message) => {
        const agent_id = message.from;

        if (agent_id in shops) {
          shops[agent_id].data.push([
            message.data.position,
            message.data.price,
            message.data.rgb,
          ]);
        } else {
          shops[agent_id] = {
            data: [
              [message.data.position, message.data.price, message.data.rgb],
            ],
          };
        }
      });

    return shops;
  };

  // Update properties of 'type' object (individual_min or overall_min)
  const update_min = (type, cost, id, position, price, rgb) => {
    type.cost = cost;
    type.agent_id = id;
    type.position = position;
    type.price = price;
    type.rgb = rgb;
  };

  const find_min = (businesses) => {
    let overall_min = {
      cost: null,
      agent_id: "",
      position: [],
      price: 0,
      rgb: null,
    };

    Object.keys(businesses).forEach((shop) => {
      let individual_min = {
        cost: null,
        agent_id: "",
        position: [],
        price: 0,
        rgb: null,
      };

      // Find min cost for each business
      businesses[shop].data.forEach((business_change) => {
        const position = business_change[0];
        const price = business_change[1];
        const rgb = business_change[2];

        const cost = calculate_cost(position, price);

        // Check min for individual business
        if (cost < individual_min.cost || individual_min.cost === null) {
          update_min(individual_min, cost, shop, position, price, rgb);
        } else if (cost === individual_min.cost) {
          if (Math.random() < 0.5) {
            update_min(individual_min, cost, shop, position, price, rgb);
          }
        }

        // Check min for all business
        if (cost < overall_min.cost || overall_min.cost === null) {
          update_min(overall_min, cost, shop, position, price, rgb);
        } else if (cost === overall_min.cost) {
          // 50% chance of picking another business if cost is the same or will pick the shop they shopped at last tick
          if (
            Math.random() < 0.5 ||
            JSON.stringify(state.rgb) === JSON.stringify(rgb)
          ) {
            update_min(overall_min, cost, shop, position, price, rgb);
          }
        }
      });

      state.addMessage(individual_min.agent_id, "customer_cost", {
        cost: individual_min.cost,
        position: individual_min.position,
        price: individual_min.price,
      });
    });

    // Only update color if min cost was determined during this time step
    if (overall_min.rgb !== null) {
      state.rgb = overall_min.rgb;
    }
  };

  const businesses = collect_business_data(context.messages());
  find_min(businesses);
};
```

</Tab>

<Tab title="init.json" >

```text
[
 {
   "behaviors": [
     "@hash/create-grids/create_grids.js",
     "@hash/create-scatters/create_scatters.js",
     "update_businesses.js",
     "@hash/create-agents/create_agents.js",
     "@hash/remove-self/remove_self.js"
   ],
   "agents": {},
   "grid_templates": [
     {
       "template_name": "grid",
       "height": 1,
       "rgb": [
         255,
         255,
         255
       ],
       "behaviors": [
         "customer.js"
       ]
     }
   ],
   "scatter_templates": [
     {
       "template_name": "businesses",
       "template_count": 2,
       "height": 3,
       "item_price": 10,
       "counter": 0,
       "counter_reset_at": 2,
       "counter_reset_to": 0,
       "behaviors": [
         "@hash/counter/counter.rs",
         "business.js"
       ]
     }
   ]
 }
]
```

</Tab>

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

  if (state.counter === 0) {
    query_customers(context.neighbors(), state.position);
  }
};
```

</Tab>
</Tabs>

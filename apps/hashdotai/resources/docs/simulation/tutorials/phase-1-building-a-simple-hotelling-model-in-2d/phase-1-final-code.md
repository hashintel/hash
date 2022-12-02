---
title: Final Code
slug: simulation/tutorials/phase-1-building-a-simple-hotelling-model-in-2d/phase-1-final-code
objectId: f7ea6fbf-e228-4bf8-afef-833b83861317
---

# Final Code

Check out the model \(Local Competition Phase 1\) in [hIndex](/@hash/local-competition-phase-1)

<Tabs>
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

<Tab title="globals.json" >

```text
{
 "topology": {
   "x_bounds": [
     0,
     10
   ],
   "y_bounds": [
     0,
     10
   ],
   "search_radius": 10
 }
}
```

</Tab>

<Tab title="update_businesses.js" >

```javascript
const behavior = (state, context) => {
  state.agents["businesses"].map((b) => {
    b.rgb = [Math.random() * 255, Math.random() * 255, Math.random() * 255];
  });
};
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

<Tab title="customer.js" >

```javascript
const behavior = (state, context) => {
  // Function to determine cost --> business price + distance from business
  const calculate_cost = (position, price) => {
    const state_position = state.get("position");
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
      state.set("rgb", overall_min.rgb);
    }
  };

  const businesses = collect_business_data(context.messages());
  find_min(businesses);
};
```

</Tab>
</Tabs>

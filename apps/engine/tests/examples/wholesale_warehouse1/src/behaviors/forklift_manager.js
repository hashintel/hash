const behavior = (state, context) => {
  const { order_interarrival_time, max_order_queue } = context.globals();

  const types = [
    "unloader",
    "transfer",
    "acceptor",
    "placement",
    "control",
    "loader",
  ];
  const delivery_keys = [
    "ATPICK",
    "UDROP",
    "ADROP",
    "TDROP",
    "STORAGE",
    "SDROP",
    "CDROP",
    "LDROP",
    "DTDROP",
  ];

  // Function: Readd forklifts to respective available queue
  const readd_forklift = (agent_name) => {
    const prefix = agent_name.match(/^[^0-9]+/)[0];
    types.forEach((t) => {
      if (prefix === t) {
        forklifts[t].available.push(agent_name);
      }
    });
  };

  // Function: Readd delivery position to forklift type plan (a or b) delivery positions
  const readd_delivery_pos = (prev_key, position) => {
    const info = keys[prev_key];
    const type = info[0];
    const plan = info[1];

    forklifts[type]["task_positions"][plan]["delivery_pos"].push(position);
  };

  // Function: Add storage position to 'placement' pickup position for plan b
  // (Used from moving from storage to control forklift pickup position)
  const fill_storage = (pos) => {
    forklifts["placement"]["task_positions"]["b"]["pickup_pos"].push(pos);
  };

  // Function: Add storage position to 'placement' delivery position for plan a
  // (Used from moving from placement delivery position to storage)
  const readd_storage = (pos) => {
    forklifts["placement"]["task_positions"]["a"]["delivery_pos"].push(pos);
  };

  const keys = state.get("keys");
  const departure_trucks = state.get("departure_trucks");
  let forklifts = state.get("forklifts");
  let orders_queue = state.get("orders_queue");
  let order_generation = state.get("order_generation");
  let order_count = state.get("order_count");
  let processed_orders = state.get("processed_orders");

  /**
   * --- Collect All Deliveries (Forklifts and Trucks) ---
   */
  const delivery_messages = context
    .messages()
    .filter((m) => m.type === "delivery")
    .map((m) => m.data);
  if (delivery_messages.length) {
    delivery_messages.forEach((m) => {
      // If not a delivery to departure trucks
      if (m.key !== "DTDROP") {
        const info = keys[m.key];
        const type = info[0];
        const plan = info[1];
        const pos = m.position;

        const current_deliv_key = delivery_keys.indexOf(m.key);
        const next_deliv_key = delivery_keys[current_deliv_key + 1];

        // Readd forklifts and delivery positions to forklift type queues
        readd_forklift(m.agent_name, m.position);
        if (m.prev_key && m.key !== "STORAGE") {
          readd_delivery_pos(m.prev_key, pos);
        } else if (m.key === "STORAGE") {
          readd_storage(pos);
        }

        const task = {
          id: m.id,
          delivery_position:
            forklifts[type]["task_positions"][plan]["delivery_pos"].shift(),
          pickup_position: pos,
          acquired: false,
          prev_delivery_key: m.key,
          delivery_key: next_deliv_key,
        };

        // Delivering to storage
        if (m.key === "TDROP") {
          fill_storage(task.delivery_position);
        }

        // If delivered to storage, add next ask to order queue (need order request for movement to occur)
        if (m.key === "STORAGE") {
          orders_queue.push(task);
        } else {
          // Else add task to next forklift type task queue
          forklifts[type].task_queue.push(task);
        }

        readd_delivery_pos(task.prev_delivery_key, task.delivery_position);
      } else {
        readd_delivery_pos(m.prev_key, m.position);

        // Notify respective delivery truck for pickup
        const pos = JSON.stringify(m.position);
        state.addMessage(departure_trucks[pos], "delivery", { id: m.id });

        processed_orders--;

        // Readd loader forklift
        readd_forklift(m.agent_name);
      }
    });
  }

  /**
   * --- Update Order Generation ---
   */
  if (order_generation) {
    order_generation.current_time++;

    if (order_generation.current_time === order_generation.time_generated) {
      order_generation = null;
    }
  }

  /**
   * --- Start Generating Orders ---
   */
  if (!order_generation && order_count !== max_order_queue) {
    order_generation = {
      current_time: 0,
      time_generated:
        Math.floor(
          Math.random() *
            (order_interarrival_time.max - order_interarrival_time.min),
        ) + order_interarrival_time.min,
    };
    order_count++;
  }

  /**
   * --- Distribute Tasks ---
   */
  types.forEach((t) => {
    if (forklifts[t].task_queue.length && forklifts[t].available.length) {
      const task = forklifts[t].task_queue.shift();
      const fl = forklifts[t].available.shift();

      // Notify arrival truck of pallet pickup
      if (task.prev_delivery_key === "ATPICK") {
        state.addMessage("arrival_truck", "pickup");
      }

      state.addMessage(fl, "task", task);
    }
  });

  /**
   * --- Distribute Order Tasks ---
   * Pull pallets from storage for orders
   */
  if (order_count > 0 && orders_queue.length) {
    const task = orders_queue.shift();
    forklifts["placement"].task_queue.push(task);
    order_count--;
    processed_orders++;
  }

  state.set("forklifts", forklifts);
  state.set("orders_queue", orders_queue);
  state.set("order_count", order_count);
  state.set("processed_orders", processed_orders);
  state.set("order_generation", order_generation);
};

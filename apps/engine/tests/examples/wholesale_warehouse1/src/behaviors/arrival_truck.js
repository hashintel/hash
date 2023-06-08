const behavior = (state, context) => {
  const { generateAgentID } = hash_stdlib;
  const agent_name = state.get("agent_name");
  const pallet_template = state.get("pallet_template");
  const delivery_positions = state.get("delivery_positions");
  const arrival_time_range = state.get("arrival_time_range");
  let generation = state.get("generation");

  /**
   * --- Update Number Of Remaining Pallets To Be Picked Up ---
   */
  const pickup_messages = context.messages().filter((m) => m.type === "pickup");
  if (pickup_messages.length) {
    generation.pickup_remaining -= pickup_messages.length;
  }

  /**
   * --- Pallet Generation ---
   * Start generating pallets if not currently generating pallets or
   * waiting for pallets to be picked up
   */
  if (!generation) {
    generation = {
      current_time: 0,
      time_generated:
        Math.floor(
          Math.random() * (arrival_time_range.max - arrival_time_range.min),
        ) + arrival_time_range.min,
      pickup_remaining: 5,
      delivered: false,
    };
  } else {
    generation.current_time++;

    generation.current_time =
      generation.current_time > generation.time_generated
        ? generation.time_generated
        : generation.current_time;
    if (generation.current_time === generation.time_generated) {
      // Deliver (Message) pallets to delivery locations if not already done so
      if (!generation.delivered) {
        for (let i = 0; i < 5; i++) {
          const agent_id = generateAgentID();
          // Create pallet agents
          state.addMessage("hash", "create_agent", {
            ...pallet_template,
            agent_id,
            position: delivery_positions[i],
            shape: "crate",
          });

          // Request pickup from forklift manager
          state.addMessage("forklift_manager", "delivery", {
            id: agent_id,
            position: delivery_positions[i],
            key: "ATPICK",
            agent_name,
          });
        }
        generation.delivered = true;
      }

      // All pallets have been delivered and picked up by unloaders
      if (generation.pickup_remaining === 0) {
        generation = null;
      }
    }
  }

  const height = generation ? generation.current_time / 4 : 0;

  state.set("generation", generation);
  state.set("height", height);
};

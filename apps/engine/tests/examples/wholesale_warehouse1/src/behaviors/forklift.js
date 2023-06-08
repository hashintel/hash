const behavior = (state, context) => {
  const state_position = state.get("position");
  let task = state.get("task");
  let utilization_stats = state.get("utilization_stats");

  /**
   * --- Collect Task ---
   */
  const task_messages = context
    .messages()
    .filter((m) => m.type === "task")
    .map((m) => m.data);
  if (task_messages.length) {
    task = task_messages[0];
  }

  /**
   * --- Deliver Pallet to Delivery Location ---
   */
  if (task) {
    if (
      JSON.stringify(state_position) === JSON.stringify(task.pickup_position) &&
      !task.acquired
    ) {
      task.acquired = true;
      state.addMessage(task.id, "pickup");
    } else if (
      JSON.stringify(state_position) ===
        JSON.stringify(task.delivery_position) &&
      task.acquired
    ) {
      state.addMessage("forklift_manager", "delivery", {
        id: task.id,
        position: task.delivery_position,
        prev_key: task.prev_delivery_key,
        key: task.delivery_key,
        agent_name: state.agent_name,
      });

      state.addMessage(task.id, "delivery", {
        position: state_position,
      });

      task = null;
    }

    utilization_stats.movement_time++;
  } else {
    utilization_stats.idle_time++;
  }

  state.set("task", task);
  state.set("utilization_stats", utilization_stats);
};

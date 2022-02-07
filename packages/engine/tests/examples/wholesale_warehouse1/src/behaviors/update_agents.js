const behavior = (state, context) => {
  const { show_zones, interarrival_time, forklifts_used } = context.globals();

  const truck_delivery_pos = state.get("truck_delivery_positions");
  const forklift_delivery_pos = state.get("forklift_delivery_positions");
  let agents = state.get("agents");

  const fill_forklift_info = () => {
    const types = [
      "unloader",
      "transfer",
      "acceptor",
      "placement",
      "control",
      "loader",
    ];
    let forklifts_info = {};

    types.forEach((t) => {
      const forklifts = agents[t];
      forklifts_info[t] = {};

      forklifts_info[t].task_positions = forklift_delivery_pos[t];
      if (t === "placement") {
        agents["storage"].forEach((s) => {
          forklifts_info[t].task_positions.a.delivery_pos.push(s.position);
        });
      }
      forklifts_info[t].task_queue = [];

      forklifts_info[t].available = [];
      const available_count = forklifts_used[t];
      let count = 0;

      forklifts.forEach((f) => {
        if (count !== available_count) {
          forklifts_info[t].available.push(f.agent_name);
          count++;
        }
      });
    });

    return forklifts_info;
  };

  agents["forklift_manager"].forEach((m) => {
    m.forklifts = fill_forklift_info();
    m.storage_info = [];
    m.departure_trucks = {};

    agents["storage"].forEach((s) => {
      m.storage_info[JSON.stringify(s.position)] = s.agent_name;
    });

    agents["departure_truck"].forEach((dt) => {
      const num = dt.agent_name.split("departure_truck")[1];
      m.departure_trucks[JSON.stringify(truck_delivery_pos.departure[num])] =
        dt.agent_name;
    });
  });

  agents["arrival_truck"].forEach((at) => {
    at.delivery_positions = truck_delivery_pos.arrival;
    at.arrival_time_range = interarrival_time;
  });

  agents["unloader"].forEach((uf) => {
    uf.reset_position = uf.position;
  });

  agents["transfer"].forEach((tf) => {
    tf.reset_position = tf.position;
  });

  agents["acceptor"].forEach((af) => {
    af.reset_position = af.position;
  });

  agents["placement"].forEach((pf) => {
    pf.reset_position = pf.position;
  });

  agents["loader"].forEach((lf) => {
    lf.reset_position = lf.position;
  });

  agents["control"].forEach((cf) => {
    cf.reset_position = cf.position;
  });

  if (!show_zones) {
    agents["unloading_zone"] = [];
    agents["reception_zone"] = [];
    agents["placement_zone"] = [];
    agents["storage_zone"] = [];
    agents["control_zone"] = [];
    agents["dispatch_zone"] = [];
  }

  state.set("agents", agents);
};

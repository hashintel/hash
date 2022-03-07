(arrow, Batches, ExperimentContext, SimInitContext, gen_sim_ctx, gen_group_state) => {
  const make_hash_set = (fields) => {
    const set = /* @__PURE__ */ Object.create(null);
    for (var i_field = 0; i_field < fields.length; ++i) {
      set[fields[i_field]] = true;
    }
    return set;
  };
  function start_experiment(datasets, pkg_init_msgs, pkg_fns) {
    this.batches = new Batches();
    for (var dataset_name in datasets)
      datasets[dataset_name] = JSON.parse(datasets[dataset_name]);
    this.experiment_ctx = new ExperimentContext(datasets);
    this.sims = {};
    this.pkgs = {};
    for (var i_pkg = 0; i_pkg < pkg_init_msgs.length; ++i_pkg) {
      const msg = JSON.parse(pkg_init_msgs[i_pkg]);
      const pkg_owned_fields = [];
      if (this.pkgs[msg.id]) {
        throw new Error("Duplicate package (id, name): " + msg.id + ", " + msg.name);
      }
      const fns = pkg_fns[i_pkg];
      const pkg_start_experiment = fns[0];
      const pkg = this.pkgs[msg.id] = {
        name: msg.name,
        type: msg.type,
        owns_field: make_hash_set(pkg_owned_fields),
        start_experiment: pkg_start_experiment,
        start_sim: fns[1],
        run_task: fns[2],
        experiment: {},
        sims: {}
      };
      if (pkg_start_experiment) {
        pkg_start_experiment(pkg.experiment, msg.payload, this.experiment_ctx);
      }
    }
  }
  const maybe_add_custom_fns = (custom_fns, to_add, custom_property, pkg) => {
    to_add = to_add[custom_property];
    if (!to_add)
      return;
    for (var field_name in to_add) {
      if (custom_fns[field_name]) {
        throw new Error("Duplicate '" + field_name + "' in " + pkg.name + " " + custom_property);
      }
      custom_fns[field_name] = to_add[field_name];
    }
  };
  const load_schema = (bytes) => {
    const reader = new arrow.MessageReader(bytes);
    const schema = reader.readSchema();
    return schema;
  };
  function start_sim(sim_id, agent_schema_bytes, msg_schema_bytes, ctx_schema_bytes, pkg_ids, pkg_msgs, globals) {
    globals = JSON.parse(globals);
    const agent_schema = load_schema(agent_schema_bytes);
    const sim = this.sims[sim_id] = {
      schema: {
        agent: agent_schema,
        msg: load_schema(msg_schema_bytes),
        ctx: load_schema(ctx_schema_bytes)
      },
      state: [],
      context_loaders: {},
      context_getters: {},
      state_loaders: {},
      state_getters: {}
    };
    const init_ctx = new SimInitContext(this.experiment_ctx, globals, agent_schema);
    for (var i_pkg = 0; i_pkg < pkg_ids.length; ++i_pkg) {
      const msg = JSON.parse(pkg_msgs[i_pkg]);
      const pkg = this.pkgs[pkg_ids[i_pkg]];
      const pkg_sim = pkg.sims[sim_id] = {};
      const pkg_start_sim = pkg.start_sim;
      if (pkg_start_sim) {
        const pkg_loaders_and_getters = pkg_start_sim(pkg.experiment, pkg_sim, msg, init_ctx);
        if (pkg_loaders_and_getters && (pkg.type === "context" || pkg.type === "state")) {
          maybe_add_custom_fns(sim[pkg.type + "_loaders"], pkg_loaders_and_getters, "loaders", pkg);
          maybe_add_custom_fns(sim[pkg.type + "_getters"], pkg_loaders_and_getters, "getters", pkg);
        }
      }
    }
    const SimContext = gen_sim_ctx(sim.schema.ctx, sim.context_getters);
    sim.ctx = new SimContext(this.experiment_ctx, globals);
    sim.GroupState = gen_group_state(sim.schema.agent, sim.state_getters);
  }
  function run_task(sim_id, i_group, pkg_id, task_message) {
    const pkg = this.pkgs[pkg_id];
    const pkg_run_task = pkg.run_task;
    if (!pkg_run_task) {
      throw new Error("Attempt to run package with no `run_task` function: " + pkg_id + ", " + pkg.name);
    }
    var ret;
    const sim = this.sims[sim_id];
    try {
      if (i_group === null || i_group === void 0) {
        ret = pkg_run_task(pkg.experiment, pkg.sims[sim_id], JSON.parse(task_message), sim.state, sim.ctx) || {};
        ret.changes = [];
        for (var j_group = 0; j_group < sim.state.length; ++j_group) {
          ret.changes[j_group] = sim.state[j_group].flush_changes(sim.schema);
        }
      } else {
        const group_ctx = sim.ctx.get_group(i_group);
        ret = pkg_run_task(pkg.experiment, pkg.sims[sim_id], JSON.parse(task_message), sim.state[i_group], group_ctx) || {};
        ret.changes = sim.state[i_group].flush_changes(sim.schema);
      }
    } catch (e) {
      return {
        pkg_error: `
Error: ${e.toString()}
Stack: ${JSON.stringify(e.stack)}
`
      };
    }
    return ret;
  }
  function ctx_batch_sync(sim_id, ctx_batch, state_group_start_idxs, current_step) {
    const sim = this.sims[sim_id];
    ctx_batch = this.batches.sync(ctx_batch, sim.schema.ctx);
    ctx_batch.load_missing_cols(sim.schema.ctx, sim.context_loaders);
    sim.ctx.set_batch(ctx_batch, state_group_start_idxs, current_step);
  }
  const _sync_pools = (sim, batches, agent_pool, message_pool) => {
    for (var i_group = 0; i_group < agent_pool.length; ++i_group) {
      agent_pool[i_group] = batches.sync(agent_pool[i_group], sim.schema.agent);
      agent_pool[i_group].load_missing_cols(sim.schema.agent, sim.state_loaders);
      message_pool[i_group] = batches.sync(message_pool[i_group], sim.schema.msg);
      message_pool[i_group].load_missing_cols(sim.schema.msg, {});
    }
  };
  function state_sync(sim_id, agent_pool, message_pool) {
    const sim = this.sims[sim_id];
    _sync_pools(sim, this.batches, agent_pool, message_pool);
    const state = sim.state;
    for (var i_group = 0; i_group < agent_pool.length; ++i_group) {
      if (state[i_group]) {
        state[i_group].set_batches(agent_pool[i_group], message_pool[i_group]);
      } else {
        state[i_group] = new sim.GroupState(agent_pool[i_group], message_pool[i_group], sim.state_loaders);
      }
    }
    for (var i2 = state.length - 1; i2 >= agent_pool.length; --i2) {
      state[i2] = void 0;
    }
  }
  function state_interim_sync(sim_id, group_idxs, agent_batches, message_batches) {
    const sim = this.sims[sim_id];
    for (var i2 = 0; i2 < group_idxs.length; ++i2) {
      const group_state = sim.state[group_idxs[i2]];
      const agent_batch = this.batches.sync(agent_batches[i2], sim.schema.agent);
      agent_batch.load_missing_cols(sim.schema.agent, sim.state_loaders);
      const msg_batch = this.batches.sync(message_batches[i2], sim.schema.msg);
      msg_batch.load_missing_cols(sim.schema.msg, {});
      group_state.set_batches(agent_batch, msg_batch);
    }
  }
  function state_snapshot_sync(sim_id, agent_pool, message_pool) {
    const sim = this.sims[sim_id];
    _sync_pools(sim, this.batches, agent_pool, message_pool);
    sim.ctx.sync_snapshot({
      agent_pool,
      message_pool
    });
  }
  return [
    start_experiment,
    start_sim,
    run_task,
    ctx_batch_sync,
    state_sync,
    state_interim_sync,
    state_snapshot_sync
  ];
};

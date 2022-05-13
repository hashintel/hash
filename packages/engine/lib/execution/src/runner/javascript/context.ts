/// `x` must not contain reference cycles.
const deepfreeze = (x) => {
  for (var k in x) {
    if (x.hasOwnProperty(k)) {
      const v = x[k];
      if (typeof v === "object") deepfreeze(v);
    }
  }
  return Object.freeze(x);
};

const gen_agent_ctx_getter = (name, getter) => {
  return getter
    ? function () {
        return getter(this, this.__cols[name][this.__idx_in_sim]);
      }
    : function () {
        return this.__cols[name][this.__idx_in_sim];
      };
};

// TODO: agent view? (__sim_ctx field, this.__cols = sim_ctx.ctx_batch.cols,
//       defineProperty(..., "state_snapshot", ... __sim_ctx.state_snapshot))
const gen_agent_ctx = (ctx_schema, getters) => {
  const AgentContext = function (
    ctx_batch,
    state_snapshot,
    current_step,
    i_agent_in_sim,
    globals,
    experiment_ctx,
  ) {
    // The context batch is sim-wide, so hide it from the user.
    // (The user should only see one current agent through an AgentContext object.)
    this.__experiment_ctx = experiment_ctx;
    this.__ctx_batch = ctx_batch;
    this.__cols = ctx_batch.cols; // Used often
    this.__current_step = current_step;
    this.__idx_in_sim = i_agent_in_sim; // (As opposed to agent index in its group)
    this.__globals = globals;
    this.state_snapshot = state_snapshot;
  };

  AgentContext.prototype.data = function () {
    return this.__experiment_ctx.data();
  };

  AgentContext.prototype.globals = function () {
    return this.__globals;
  };

  AgentContext.prototype.step = function () {
    return this.__current_step;
  };

  for (var i_field = 0; i_field < ctx_schema.fields.length; ++i_field) {
    // `name` is the name of some context batch column
    const name = ctx_schema.fields[i_field].name;
    const getter = gen_agent_ctx_getter(name, getters[name]);
    AgentContext.prototype[name] = getter;
  }

  return Object.seal(AgentContext);
};

const gen_group_ctx = (AgentContext) => {
  const GroupContext = function (
    ctx_batch,
    state_snapshot,
    current_step,
    group_start_idx,
    globals,
    experiment_ctx,
  ) {
    // The context batch is sim-wide, so hide it from the user.
    // (The user should only see one current group through a GroupContext object.)
    this.__experiment_ctx = experiment_ctx;
    this.__globals = globals;
    this.__ctx_batch = ctx_batch;
    this.__start_idx = group_start_idx;
    this.__current_step = current_step;
    this.state_snapshot = state_snapshot;
  };

  GroupContext.prototype.data = function () {
    return this.__experiment_ctx.data();
  };

  GroupContext.prototype.globals = function () {
    return this.__globals;
  };

  GroupContext.prototype.step = function () {
    return this.__current_step;
  };

  GroupContext.prototype.get_agent = function (
    i_agent_in_group,
    old_agent_ctx,
  ) {
    const idx_in_sim = i_agent_in_group + this.__start_idx;
    if (old_agent_ctx) {
      // Reuse AgentContext object for performance.
      old_agent_ctx.__idx_in_sim = idx_in_sim;
      return old_agent_ctx;
    }
    return Object.seal(
      new AgentContext(
        this.__ctx_batch,
        this.state_snapshot,
        this.__current_step,
        idx_in_sim,
        this.__globals,
        this.__experiment_ctx,
      ),
    );
  };

  return Object.seal(GroupContext);
};

export const gen_sim_ctx = (ctx_schema, getters) => {
  const AgentContext = gen_agent_ctx(ctx_schema, getters);
  const GroupContext = gen_group_ctx(AgentContext);

  const SimContext = function (experiment_ctx, globals) {
    this.__experiment_ctx = experiment_ctx;
    this.__globals = deepfreeze(globals);
    this.__ctx_batch = null;
    this.__group_start_idxs = null;
    this.__current_step = null;
    this.state_snapshot = null;
  };

  SimContext.prototype.data = function () {
    return this.__experiment_ctx.data();
  };

  SimContext.prototype.globals = function () {
    return this.__globals;
  };

  SimContext.prototype.step = function () {
    return this.__current_step;
  };

  /// Invalidates existing `GroupContext` and `AgentContext` objects.
  SimContext.prototype.set_batch = function (
    ctx_batch,
    state_group_start_idxs,
    current_step,
  ) {
    this.__ctx_batch = ctx_batch;
    this.__group_start_idxs = state_group_start_idxs;
    this.__current_step = current_step;
  };

  /// Invalidates existing `GroupContext` and `AgentContext` objects.
  SimContext.prototype.sync_snapshot = function (state_snapshot) {
    this.state_snapshot = state_snapshot;
  };

  SimContext.prototype.get_group = function (i_group) {
    return Object.seal(
      new GroupContext(
        this.__ctx_batch,
        this.state_snapshot,
        this.__current_step,
        this.__group_start_idxs[i_group],
        this.__globals,
        this.__experiment_ctx,
      ),
    );
  };

  SimContext.prototype.get_agent = function (i_agent_in_sim, old_agent_ctx) {
    if (old_agent_ctx) {
      // Reuse AgentContext object for performance.
      old_agent_ctx.__idx_in_sim = i_agent_in_sim;
      return old_agent_ctx;
    }

    return Object.seal(
      new AgentContext(
        this.__ctx_batch,
        this.state_snapshot,
        this.__current_step,
        i_agent_in_sim,
        this.__globals,
        this.__experiment_ctx,
      ),
    );
  };

  return Object.seal(SimContext);
};

export const ExperimentContext = function (datasets) {
  this.__datasets = deepfreeze(datasets);
};

ExperimentContext.prototype.data = function () {
  return this.__datasets;
};

export const SimInitContext = function (experiment_ctx, globals, agent_schema) {
  this.__experiment_ctx = experiment_ctx;
  this.__globals = deepfreeze(globals);
  this.agent_schema = agent_schema;
};

SimInitContext.prototype.data = function () {
  return this.__experiment_ctx.data();
};

SimInitContext.prototype.globals = function () {
  return this.__globals;
};

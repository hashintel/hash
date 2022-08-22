import * as hash_util from "./lib/execution/src/runner/javascript/hash_util.js";

// TODO: Propagate field specs to runners and use in state and context objects
const BEHAVIOR_INDEX_FIELD_KEY = "_PRIVATE_7_behavior_index";

const throw_missing_field = (field) => {
  throw new ReferenceError("Missing field (behavior keys?): " + field);
};

const gen_state_accessors = (AgentState, agent_schema, custom_getters) => {
  if (custom_getters.agent_id) {
    throw new Error("`agent_id` isn't allowed to have a custom getter.");
  }

  for (var i = 0; i < agent_schema.fields.length; ++i) {
    const name = agent_schema.fields[i].name;

    let getter;
    let setter;

    if (name === "agent_id") {
      getter = function () {
        return hash_util.uuid_to_str(this.__cols.agent_id[this.__idx_in_group]);
      };
      setter = function (value) {
        throw new ReferenceError("`agent_id` is read-only");
      };
    } else {
      const custom = custom_getters[name];
      if (custom) {
        getter = function () {
          if (!this.__cols[name]) {
            // Slow path
            if (this.__dyn_access) {
              this.__cols[name] = this.__group_state.load(name);
            } else {
              throw_missing_field(name);
            }
          }
          return custom(this, this.__cols[name][this.__idx_in_group]);
        };
      } else {
        getter = function () {
          if (!this.__cols[name]) {
            // Slow path
            if (this.__dyn_access) {
              this.__cols[name] = this.__group_state.load(name);
            } else {
              throw_missing_field(name);
            }
          }
          return this.__cols[name][this.__idx_in_group];
        };
      }

      setter = function (value) {
        if (!this.__cols[name]) {
          // Slow path
          if (this.__dyn_access) {
            this.__cols[name] = this.__group_state.load(name);
          } else {
            throw_missing_field(name);
          }
        }
        this.__cols[name][this.__idx_in_group] = value;
      };
    }
    Object.defineProperty(AgentState.prototype, name, {
      get: getter,
      set: setter,
    });
  }

  const msgs_getter = function () {
    const idx = this.__idx_in_group;
    let value = this.__msgs[idx];
    if (value) {
      return value;
    } else {
      return [];
    }
  };
  const msgs_setter = function (value) {
    this.__msgs[this.__idx_in_group] = value;
  };
  Object.defineProperty(AgentState.prototype, "messages", {
    get: msgs_getter,
    set: msgs_setter,
  });
};

const gen_agent_state = (agent_schema, getters) => {
  const AgentState = function (group_state, i_agent_in_group) {
    this.__group_state = group_state;
    this.__cols = group_state.__agent_batch.cols;
    this.__msgs = group_state.__msg_batch.cols.messages;
    this.__idx_in_group = i_agent_in_group;
    this.__dyn_access = false;
  };

  AgentState.prototype.set_dynamic_access = function (enable_dynamic_access) {
    this.__dyn_access = enable_dynamic_access;
  };

  AgentState.prototype.to_json = function () {
    // TODO: Benchmark making an array with all field names
    //       outside of this function (maybe faster access)
    const r = {};
    for (var i = 0; i < agent_schema.length; ++i) {
      const name = agent_schema.fields[i].name;
      r[name] = hash_util.json_deepcopy(this[name]);
    }
    r.messages = hash_util.json_deepcopy(this.messages);
    return r;
  };

  AgentState.prototype.get = function (field_name) {
    let value = hash_util.json_deepcopy(this[field_name]);
    if (field_name === "messages" && !value) {
      return [];
    } else {
      return value;
    }
  };

  AgentState.prototype.set = function (field_name, value) {
    this[field_name] = hash_util.json_deepcopy(value);
  };

  AgentState.prototype.modify = function (field_name, fn) {
    this.set(field_name, fn(this.get(field_name)));
  };

  /// Similarly to `get` and `set`, if the user mutates the arguments
  /// of `addMessage` later, it won't affect the agent's state.

  /// `to` must be either a string or an object. If it's a string,
  /// it must be a single agent id or name. If it's an object, it must
  /// be an array of agent ids and/or names. `to` is automatically
  /// converted to an array if it's not one already.

  /// `data` is an optional argument. `data` must be JSON-serializable.
  AgentState.prototype.addMessage = function (to, msg_type, data) {
    // Keeps native messages native and JSON messages as JSON.
    let new_message = {
      to: typeof to === "string" ? [to] : to.slice(),
      type: msg_type, // `msg_type` is a string, so don't need to deepcopy it.
      data: hash_util.json_deepcopy(data),
    };
    // because arrow2 serializes empty arrays as `null`, if there are no messages, then we
    // need to set the field (because we can't push to null)
    if (!this.__msgs[this.__idx_in_group]) {
      this.__msgs[this.__idx_in_group] = [new_message];
    } else {
      this.__msgs[this.__idx_in_group].push(new_message); // json_stringify(null) === 'null'.
    }
  };

  /// Returns the index of the currently executing behavior in the agent's behavior chain.
  AgentState.prototype.behaviorIndex = function () {
    return this[BEHAVIOR_INDEX_FIELD_KEY];
  };

  gen_state_accessors(AgentState, agent_schema, getters);
  return Object.seal(AgentState);
};

export const gen_group_state = (agent_schema, getters) => {
  const AgentState = gen_agent_state(agent_schema, getters);
  const GroupState = function (agent_batch, msg_batch, loaders) {
    this.__agent_batch = agent_batch;
    this.__msg_batch = msg_batch;
    this.__loaders = loaders;
  };

  GroupState.prototype.set_batches = function (agent_batch, msg_batch) {
    this.__agent_batch = agent_batch;
    this.__msg_batch = msg_batch;
  };

  GroupState.prototype.to_json = function () {
    throw new Error("Group state shouldn't be copied to JSON.");
  };

  GroupState.prototype.load = function (field_name) {
    if (!this.__agent_batch.vectors[field_name]) {
      throw_missing_field(field_name); // Missing even with dynamic access
    }

    return this.__agent_batch.load_col(field_name, this.__loaders[field_name]);
  };

  // Returns the number of agents in this group.
  GroupState.prototype.n_agents = function () {
    return this.__agent_batch.cols.agent_id.length;
  };

  GroupState.prototype.get_agent = function (
    i_agent_in_group,
    old_agent_state,
  ) {
    if (old_agent_state) {
      old_agent_state.__idx = i_agent_in_group;
      return old_agent_state;
    }
    return new AgentState(this, i_agent_in_group);
  };

  GroupState.prototype.flush_changes = function (schema) {
    // TODO: Only flush columns that were written to.
    //       (Set written flag in `state.set` and `state.addMessage`.)
    // TODO: Only flush columns that can't be written to in-place.
    // TODO: Don't flush e.g. the `agent_id` column, which only needs to be read, not written.

    const skip = Object.create(null);
    skip.agent_id = true;
    // TODO: improve the handling of this
    // (see https://app.asana.com/0/1199548034582004/1202815168504002/f for details)
    skip["_PRIVATE_7_behavior_ids"] = true;
    const agent_changes = this.__agent_batch.flush_changes(schema.agent, skip);

    // Convert message objects to JSON before flushing message batch.
    // Note that this is distinct from (though analogous to) 'any'-type handling
    // in `batch.flush_changes`.
    // TODO: Overwriting data is not ideal, preferably we only deserialize when we need it (i.e. we should only have
    //  have to call JSON.stringify on messages we've accessed and deserialized), instead right now we do that for
    //  all messages, that is, they're all native JS objects
    const group_msgs = this.__msg_batch.cols.messages;
    for (var i_agent = 0; i_agent < group_msgs.length; ++i_agent) {
      const agent_msgs = group_msgs[i_agent];
      // note: arrow2 serializes empty fields as null objects
      if (agent_msgs) {
        for (var i = 0; i < agent_msgs.length; ++i) {
          agent_msgs[i].data = JSON.stringify(agent_msgs[i].data);
        }
      }
    }
    const msg_changes = this.__msg_batch.flush_changes(schema.msg, {});

    return {
      agent: agent_changes,
      msg: msg_changes,
    };
  };

  return Object.seal(GroupState);
};

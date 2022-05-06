import * as hash_util from "./lib/execution/src/runner/javascript/hash_util.js";

const InboxMessage = function (ctx_msg_pool, msg_loc) {
  this.__pool = ctx_msg_pool;
  this.__loc = msg_loc; // i_group, i_agent, i_msg
  // (`i_msg` was index in  `agent_state.messages` on the previous step.)
  this.__data = null;
};

InboxMessage.prototype.to_json = function () {
  // TODO: Deepcopying inbox messages or storing them in Arrow (in which case
  //       they have to be converted to JSON-serializable objects first) is
  //       rare enough that performance probably isn't important here, but
  //       this function could be sped up by inlining the property getters and
  //       eliminating redundant message lookup.
  return {
    data: this.data,
    type: this.type,
    from: this.from,
    to: this.to,
  };
};

Object.defineProperty(InboxMessage.prototype, "data", {
  get: function () {
    if (this.__data === null) {
      const l = this.__loc;
      this.__data = JSON.parse(
        this.__pool[l.get(0)].cols.messages[l.get(1)][l.get(2)].data,
      );
    }
    // TODO: Freeze instead of copying?
    return hash_util.json_deepcopy(this.__data);
  },
});

Object.defineProperty(InboxMessage.prototype, "from", {
  get: function () {
    // TODO: `uuid_to_str` each time vs caching like for `data` property.
    const l = this.__loc;
    return hash_util.uuid_to_str(this.__pool[l.get(0)].cols.from[l.get(1)]);
  },
});

Object.defineProperty(InboxMessage.prototype, "type", {
  get: function () {
    // `type` is a string, which is a primitive value, so
    // it doesn't need to be copied or frozen.
    const l = this.__loc;
    return this.__pool[l.get(0)].cols.messages[l.get(1)][l.get(2)].type;
  },
});

Object.defineProperty(InboxMessage.prototype, "to", {
  get: function () {
    const l = this.__loc;
    return this.__pool[l.get(0)].cols.messages[l.get(1)][l.get(2)].to.slice();
  },
});

const loaders = {
  /// `messages` column loader of context batch (*not* state_snapshot -- state
  /// agent and message pools are loaded identically with state_snapshot agent
  /// and message pools. state_snapshot is inside the context, but not the
  /// context batch)
  messages: hash_util.load_shallow,
};

const getters = {
  /// AgentContext `messages` property getter (`agent_context.messages`)
  /// Uses AgentContext `api_responses` getter if it is defined
  /// (i.e. if there is an `api_requests` package). To avoid
  /// recursion, this `messages` property getter should *not* be
  /// called inside the `api_responses` getter.
  messages: (agent_context, msg_locs) => {
    const pool = agent_context.state_snapshot.message_pool;
    const msgs = [];
    for (var i_msg = 0; i_msg < msg_locs.length; ++i_msg) {
      // context_batch `messages` column was shallow-loaded, so `msg_locs`
      // is an Arrow object, so need to access it using `get`, not `[]`.
      const loc = msg_locs.get(i_msg);
      msgs[i_msg] = new InboxMessage(pool, loc);
    }

    // Assume number of api responses is small enough that they can fit on the stack.
    if (agent_context.api_responses)
      msgs.push(...agent_context.api_responses());
    return msgs;
  },
};

export const start_sim = (experiment, sim, init_message, init_context) => {
  return {
    loaders: loaders,
    getters: getters,
  };
};

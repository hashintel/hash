// TODO: Propagate field specs to runners and use in state and context objects
const BEHAVIOR_INDEX_FIELD_KEY = "_PRIVATE_7_behavior_index";
const BEHAVIOR_IDS_FIELD_KEY = "_PRIVATE_7_behavior_ids";

// The `BEHAVIOR_INDEX_FIELD_KEY` column is reset to zero and the private `behavior_ids`
// column is written to
// in the simulation main loop immediately before running the behavior execution
// package.

// The `behaviors` column contains behavior names and can change in the
// middle of running the behavior execution package, but `__behaviors`
// contains behavior ids and shouldn't be modified.

const supported_languages = ["JavaScript", "TypeScript"];

const prepare_user_trace = (error, trace) => {
  let behavior_index = -1;
  for (var i = trace.length - 1; i >= 0; --i) {
    if (trace[i].isEval() && trace[i].getFunctionName() === "behavior") {
      behavior_index = i;
      break;
    }
  }

  if (behavior_index >= 0) {
    // Behavior function was found in stack trace.
    // Remove our (i.e. JS runner's) functions from end of trace.
    while (behavior_index < trace.length - 1) {
      // Behavior isn't last element.
      trace.pop();
    }
  }

  const frames = [];
  for (var i = 0; i < trace.length; ++i) {
    var t = trace[i];
    frames[i] = {
      file: t.getFileName(),
      // Behavior line numbers are off by 2 somehow.
      line: t.getLineNumber() - (i === behavior_index ? 2 : 0),
      fn: t.getFunctionName(),
    };
  }

  return {
    msg: error.toString(),
    frames: frames,
  };
};

/// `behavior_descs` should be a list of objects with fields `id`, `name`, `source`, `columns`,
/// `language` and `dyn_access`.
const load_behaviors = (experiment, behavior_descs) => {
  experiment.logged = "";
  const console = new Proxy(
    {},
    {
      get: (_, property) => {
        if (property === "log")
          return (...args) => {
            for (var i = 0; i < args.length; ++i) {
              experiment.logged = experiment.logged + args[i] + " ";
            }
            experiment.logged = experiment.logged + "\n";
          };

        return (...args) => {}; // generic noop function.
      },
      // TODO: non-noop implementation of `console` functions other than `log`
      // TODO: give error instead of returning noop function for methods that
      //       `console` object doesn't usually have
    },
  );

  const behaviors = {};
  for (var i = 0; i < behavior_descs.length; ++i) {
    const desc = behavior_descs[i];

    if (!supported_languages.includes(desc.language)) {
      behaviors[desc.id] = {
        language: desc.language,
      };

      continue;
    }

    const code = desc.source;

    let fn;
    try {
      fn = new Function(
        "hash_stdlib",
        "hstd",
        "console",
        `${code}\nreturn behavior`,
      )(hash_stdlib, hash_stdlib, console);
    } catch (e) {
      // Catch behavior code syntax errors and rethrow.
      Error.prepareStackTrace = prepare_user_trace;
      const trace = e.stack;
      trace.msg =
        "Couldn't load behavior (NAME " +
        desc.name +
        ", SOURCE " +
        code +
        "):" +
        trace.msg;
      throw new Error(JSON.stringify(trace));
    }
     
    let t = typeof fn;
    if (t !== "function") {
      throw new TypeError(
        desc.name + ": Behavior must be function, but is " + t + ".",
      );
    }

    behaviors[desc.id] = {
      fn: fn,
      name: desc.name,
      required_col_names: desc.columns,
      dyn_access: desc.dyn_access,
      language: desc.language,
      // Language of loaded behaviors is always Javascript,
      // since couldn't load them here otherwise.
    };
    // TODO
    // if (!desc.columns) {
    //     throw new TypeError(
    //         desc.name + " required_col_names " + typeof desc.columns
    //     );
    // }
  }

  experiment.behaviors = behaviors;
};

// Incorrect because behaviorIndex has historically been a function, not a property:
// const getters = {
//     "behaviorIndex": agent_state => agent_state[BEHAVIOR_INDEX_FIELD_KEY]
// }

export const start_experiment = (
  experiment,
  init_message,
  experiment_context,
) => {
  load_behaviors(experiment, init_message);
};

// Fill an array with a default value until its length is 3
const fill3 = (arr, val) => {
  while (arr.length < 3) {
    arr.push(val);
  }
};

const postprocess = (agent_state) => {
  const msgs = agent_state.messages;
  if (msgs) {
    for (var i = 0; i < msgs.length; ++i) {
      const m = msgs[i];
      if (typeof m.to === "string") m.to = [m.to];
    }
  }

  // Extend partial 3D coordinates with zeros.
  // TODO: Fill `scale`? (Fill with 1.0 instead of 0.0?) `rgb`?
  // `position` and `direction` are nullable fields.

  const position = agent_state.position;
  if (position) fill3(position);

  const direction = agent_state.direction;
  if (direction) fill3(direction);
};

export const run_task = (
  experiment,
  sim,
  task_message,
  group_state,
  group_context,
) => {
  // Reset `experiment.logged`, because it might have been written to
  // during a previous `run_task` call.
  experiment.logged = "";
  // Mutating `experiment.logged` here is ok because its value at the
  // start of a task doesn't depend on the order that tasks are executed
  // in (it's always "") and two tasks can't be executed simultaneously
  // in the same worker (they can be executed simultaneously in different
  // workers, but then the different workers would have their own instances
  // of the `experiment` object).

  let next_lang = null;
  let agent_state = null;
  let agent_ctx = null;

  const n_agents_in_group = group_state.n_agents();
  for (var i_agent = 0; i_agent < n_agents_in_group; ++i_agent) {
    // TODO: Reuse `agent_state` objects. When using the old `agent_state`, the indices for behaviors are borked
    agent_state = group_state.get_agent(i_agent, null);
    // TODO: Reuse `agent_ctx` objects. When using the old `agent_ctx`
    agent_ctx = group_context.get_agent(i_agent, null);

    const behavior_ids = agent_state[BEHAVIOR_IDS_FIELD_KEY];
    const n_behaviors = behavior_ids.length;
    for (
      var i_behavior = agent_state.behaviorIndex();
      i_behavior < n_behaviors;
      ++i_behavior
    ) {
      const b_id = behavior_ids.get(i_behavior);
      // We do this because behavior ids are shallow-loaded and
      // `b_id` is an Arrow Vec rather than a clean array
      const behavior = experiment.behaviors[[b_id.get(0), b_id.get(1)]];
      if (!supported_languages.includes(behavior.language)) {
        // TODO: A simple optimization would be to count the number of
        //       next-up behaviors in each language (other than JS) and
        //       (ignoring ties) choose the language with the most. This
        //       wouldn't hurt performance at all in the case where all
        //       behaviors are in JS.
        next_lang = behavior.language; // Multiple assignments are fine.
        break;
      }

      agent_state.set_dynamic_access(behavior.dyn_access);
      try {
        behavior.fn(agent_state, agent_ctx);
        postprocess(agent_state);
      } catch (e) {
        Error.prepareStackTrace = prepare_user_trace;
        const trace = e.stack;
        throw Error(JSON.stringify(trace));
      }

      // Increment the behavior index to point to the next one to be executed
      agent_state[BEHAVIOR_INDEX_FIELD_KEY] = i_behavior + 1;
    }
  }

  return {
    print: experiment.logged,
    target: next_lang || "Main",
    task: "{}", // TODO: Maybe this shouldn't be necessary
  };
};

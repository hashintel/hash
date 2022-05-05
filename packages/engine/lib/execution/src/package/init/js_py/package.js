const _prepare_user_trace = (error, trace) => {
  // TODO: Check that line numbers aren't off by 2
  const frames = [];
  for (var i = 0; i < trace.length; ++i) {
    var t = trace[i];
    frames[i] = {
      file: t.getFileName(),
      line: t.getLineNumber(),
      fn: t.getFunctionName(),
    };
  }
  return {
    msg: error.toString(),
    frames: frames,
  };
};

const _load_init_fn = (console, source) => {
  try {
    const fn = new Function(
      "hash_stdlib",
      "hstd",
      "console",
      `${source}\nreturn init`,
    )(hash_stdlib, hash_stdlib, console);

    if (typeof fn !== "function") {
      throw new Error(`must be a function not '${typeof fn}'`);
    }

    return fn;
  } catch (e) {
    // Catch errors while loading the init function
    // TODO
    // Error.prepareStackTrace = prepare_user_trace;
    const trace = e.stack;
    trace.msg =
      "Couldn't load init function (SOURCE " + source + "):" + trace.msg;
    throw new Error(json_stringify(trace));
  }
};

export const run_task = (
  experiment,
  _sim,
  task_message,
  _group_state,
  context,
) => {
  if (!task_message.hasOwnProperty("Start")) {
    throw new Error(`unknown message type received for run_task'`);
  }

  const source = task_message.Start.initial_state_source;

  // Reset `experiment.logged`, because it might have been written to
  // during a previous `run_task` call.
  experiment.logged = "";
  // Mutating `experiment.logged` here is ok because its value at the
  // start of a task doesn't depend on the order that tasks are executed
  // in (it's always "") and two tasks can't be executed simultaneously
  // in the same worker (they can be executed simultaneously in different
  // workers, but then the different workers would have their own instances
  // of the `experiment` object).

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

  let init_fn = _load_init_fn(console, source);

  let agents;
  try {
    agents = init_fn(context);
  } catch (e) {
    // TODO
    // Error.prepareStackTrace = prepare_user_trace;
    const trace = e.stack;
    throw new Error(JSON.stringify(trace));
  }

  if (!Array.isArray(agents)) {
    throw new Error(`init must return an array not '${typeof agents}'`);
  }

  let task_as_str;
  try {
    const msg = {
      Success: {
        agents: agents,
      },
    };

    task_as_str = JSON.stringify(msg);
  } catch (e) {
    throw new Error(
      `could not serialize init return value to JSON: ${e.message}`,
    );
  }

  // TODO: Change the runner to avoid this, perhaps a function or a well-defined object would make this clearer.
  return {
    task: task_as_str,
    print: experiment.logged,
  };
};

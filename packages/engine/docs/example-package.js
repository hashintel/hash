// TODO: JSDoc

// Each package optionally has a `package.js` file, with three optional functions:
// * `start_experiment`
// * `start_sim`
// * `run_task`

// The `hash_util` module is automatically made available to packages.

/// `start_experiment` is called once for each worker at the start of an experiment.
///
/// Arguments:
///
///     `experiment`: An initially empty object that the package can store
///                   experiment-level data in if it needs to. This is
///                   shared between simulation runs within a worker.
///
///     `init_message`: The message sent from the Rust part of the package
///                     to the runners at the start of an experiment. This
///                     is an arbitrary JavaScript value that has been
///                     deserialized from JSON.
///
///     `experiment_context`: Experiment-level context, i.e. everything in the
///                           context that isn't specific to a simulation run.
///                           Currently this is just datasets, returned from
///                           `experiment_context.data()`.
///
/// `start_experiment` optionally returns an object with optional fields:
///
///     `warnings`: An array of strings. If present, these are logged as
///                 warnings about user code/input to the package.
///
///     `errors`: An array of strings. If present, these are logged as
///               user errors and the experiment is stopped.
///
const start_experiment = (experiment, init_message, experiment_context) => {
  experiment.min_size = init_message.min_size;
  return {
    warnings: ["user warning"],
    errors: ["user error"],
  };
};

/// `start_sim` is called for each worker at the start of each simulation run.
///
/// Arguments:
///
///     `experiment`: If `start_experiment` was present, this is the same object
///                   that was passed to it. Otherwise this is an empty object.
///
///                   Note: If `experiment` is mutated in `start_sim`, the set of
///                   return values of all `start_sim` calls shouldn't depend on
///                   the order in which different simulation runs are started.
///                   `experiment` should be the same at the start and end of each
///                   `start_sim` call.
///
///                   Note: Simulation runs can be started at arbitrary times during
///                   an experiment, including after a `run_task` call for a different
///                   simulation run with the same `experiment` object.
///
///     `sim`: An initially empty object that the package can store sim-level data in
///            if it needs to. A new empty object is passed for each simulation run in
///            each worker.
///
///     `init_message`: A message sent from the Rust part of the package to the
///                     runners at the start of a simulation run. This is an
///                     arbitrary JavaScript value that has been deserialized
///                     from JSON.
///
///     `init_context`: Sim-level context that is available at the start of
///                     a simulation run, along with experiment-level context.
///                     Currently this contains datasets, returned from
///                     `init_context.data()`, globals, returned from
///                     `init_context.globals()`, and the Arrow agent schema,
///                     `init_context.agent_schema`.
///
/// `start_sim` optionally returns an object with optional fields:
///
///     `warnings`: An array of strings. If present, these are logged as
///                 user warnings.
///
///     `errors`: An array of strings. If present, these are logged as
///               user errors and the simulation run is stopped.
///
///     `loaders`: An object mapping column names to custom loaders, for
///                columns that don't use the default loaders. Only state
///                and context packages can have custom loaders.
///
///     `getters`: An object mapping column names to custom getters, for
///                columns that don't use the default getters. Only state
///                and context packages can have custom getters.
///
const start_sim = (experiment, sim, init_message, init_context) => {
  sim.size = experiment.min_size + init_message.additional_size;
  return {
    warnings: ["user warning"],
    errors: ["user error"],
    loaders: {
      column_name: hash_util.load_shallow,
      another_column: hash_util.load_full,
    },
    getters: {
      column_name: (agent_context, column_element) => column_element,
    },
  };
};

/// `run_task` is called each time the package sends a task to a language runner.
///
/// Arguments:
///
///     `experiment`: If `start_experiment` was present, this is the same object
///                   that was passed to it. Otherwise this is an empty object.
///
///                   Note: `experiment` should be the same at the start and end
///                   of each `run_task` call.
///
///     `sim`: If `start_sim` was present, this is the same object that was passed
///            to it. Otherwise this is an empty object.
///
///            Note: `sim` should be the same at the start and end of each `run_task`
///            call.
///
///     `task_message`: A message sent from the Rust part of the package to the
///                     runner. This is an arbitrary JavaScript value that has
///                     been deserialized from JSON.
///
///     `context`: If this is a group-wise task, a single group's context;
///                otherwise sim-level context. In either case, this also
///                contains experiment-level context. Use `get_group` (in
///                the case of sim-level context) and `get_agent` to access
///                a single group's or agent's Arrow data.
///
///     `state`: If this is a group-wise task, a single group's state;
///              otherwise sim-level state. Use `get_group` (in the case of
///              sim-level state) and `get_agent` to access a single group's
///              or agent's Arrow data.
///
/// `run_task` optionally returns an object with optional fields:
///
///     `warnings`: An array of strings. If present, these are logged as
///                 user warnings.
///
///     `errors`: An array of strings. If present, these are logged as
///               user errors and the simulation run is stopped.
///
///     `target`: Where to continue execution next. This can be a language
///               ("Python", "JavaScript" or "Rust), "Dynamic" (call a
///               task-specific function in Rust that dynamically decides
///               the next target) or "Main" (return to the main part of
///               the package in Rust, i.e. the simulation run's main loop).
///
///     `task`: The task message to send to the next target -- a JSON string.
///
///     `print`: An arbitrary string with info to display to the user.
///
const run_task = (experiment, sim, task_message, state, context) => {
  const fits_in_sim = task_message.my_number < sim.size;
  return {
    warnings: ["user warning"],
    errors: ["user error"],
    target: "Main",
    task: JSON.stringify(fits_in_sim),
    print: "sim size: " + sim.size,
  };
};

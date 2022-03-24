import logging
import sys
import time

from batch import Batches
from context import SimInitContext
from fbs.RunnerInboundMsgPayload import RunnerInboundMsgPayload
from package import Package
from sim import Sim
from message import Messenger
from util import format_exc_info

"""
Amount of seconds to sleep before freeing resources.
"""
SLEEP_BEFORE_FREE = 2


# We want to catch everything
# pylint: disable=broad-except
class Runner:
    def __init__(self, experiment_id, worker_index):
        try:
            self.messenger = Messenger(experiment_id, worker_index)
        except Exception as error:
            # Can't do much if messenger init fails.
            logging.error("Messenger init failed: %s", error)
            raise error

        self.batches = Batches()
        self.sims = {}
        self.pkgs = {}
        self.experiment_ctx = None

        try:
            # Package/user error
            # TODO: Use execptions instead
            #   see https://app.asana.com/0/1199548034582004/1202011714603649/f
            if self.start_experiment():
                self._free_after_sent()
        except Exception as error:
            # Have to catch generic Exception -- if we knew what the error
            # in the runner was, we could have fixed it in the first place.
            self._handle_runner_error(sys.exc_info())
            raise error

    def start_experiment(self):
        """
        Wait for an init message from the Rust process, then use it
        to initialize experiment-level context (`self.experiment_ctx`)
        and each package's experiment-level data (`self.pkgs`).
        The packages' source code is not included in the message,
        but each package's name and type is included, and its
        source code is looked up from a path determined by its
        name and type.

        If an error occurs during a package's custom experiment-level
        initialization (whether a package or user error), it is sent
        to the Rust process and experiment init is stopped early and
        `True` is returned. (`True` is returned instead of raising
        an exception in order to distinguish runner errors from
        package/user errors.)

        User warnings are also sent to the Rust process, but do not
        stop experiment-level init.

        This function is actually only called once per Python process,
        soon after the process starts, because the init message is
        always the first message that the Rust process sends to a
        Python process.

        :return: Whether a package/user error occurred
        """
        init = self.messenger.recv_init()
        self.experiment_ctx = init.shared_ctx
        for pkg_id, config in init.pkgs.items():
            self.pkgs[pkg_id] = pkg = Package(
                name=config.name,
                pkg_type=config.type,
                owned_fields=[],  # TODO: Propagate `config.owned_fields` here.
            )

            if pkg.start_experiment is not None:
                try:
                    result = pkg.start_experiment(
                        pkg.experiment, config.payload, self.experiment_ctx
                    )
                    were_user_errors = self._handle_experiment_init_result(pkg, result)
                    if were_user_errors:
                        # TODO: Should we kill the runner here or let the Rust process
                        #       terminate it after receiving user errors?
                        return True

                except Exception:
                    # Have to catch generic exception, because package could throw anything.
                    self._handle_pkg_error(pkg, "experiment init", sys.exc_info())
                    return True

        return False

    def _handle_experiment_init_result(self, pkg, result):
        """
        :param pkg: The package object, with experiment-level data
        :param result: What the package's custom experiment init returned
        :return: Whether any user errors occurred during this
                 package's experiment init
        """
        # Not checking for None as we are currently not consistent with returns from packages
        if not result:  # Package didn't return anything.
            return False

        prefix = f"Package `{pkg.name}` experiment init: "
        warnings = result.get("warnings")
        if warnings is not None:
            warnings = tuple(prefix + w for w in warnings)
            self.messenger.send_user_warnings(warnings)

        errors = result.get("errors")
        if errors is not None:
            errors = tuple(prefix + e for e in errors)
            self.messenger.send_user_errors(errors)
            return True

        return False

    def _handle_runner_error(self, exc_info, sim_id=0):
        """
        Notify the Rust process about the runner error and then kill the runner.

        User errors definitely need to be sent back to the Rust process, so
        they can be sent further to the user and displayed.

        Package error sending is more of a nice-to-have, but helps users
        report bugs to package authors.

        Runner errors just need to reach our logs, so their contents don't
        really need to be sent back, but it's still good to notify the
        Rust process that a runner error occurred, so it immediately knows
        that the runner exited.

        :param exc_info: See `format_exc_info` in `util.py`.
        :param sim_id: ID of the simulation run from which the error originated.
                       If the error isn't specific to any simulation run, we
                       use 0 as an invalid id.
        """

        error = f"Runner error: {format_exc_info(exc_info)}"
        logging.error(
            error
        )  # First make sure the error gets logged; then try to send it.
        self.messenger.send_runner_error(error, sim_id)
        self._free_after_sent()

    def _handle_pkg_error(self, pkg, origin, exc_info, sim_id=0):
        """
        :param pkg: The package object, with at least experiment-level data
        :param origin: What part of the package's source code the error
                       occurred in (e.g. sim init, experiment init)
        :param exc_info: See `format_exc_info` in `util.py`.
        :param sim_id: ID of the simulation run from which the error originated.
                       If the error isn't specific to any simulation run, we
                       use 0 as an invalid id.
        """
        error = f"Package `{pkg.name}` {origin}: {format_exc_info(exc_info)}"
        # TODO: Custom log level(s) for non-engine (i.e. package/user) errors/warnings,
        #       e.g. `logging.external_error`?
        logging.error(
            error
        )  # First make sure the error gets logged; then try to send it.
        self.messenger.send_pkg_error(error, sim_id)

    def _free_after_sent(self):
        """
        Give the Rust process time to receive nng messages and then
        kill the runner.
        """
        # TODO: check/fix shared memory allocation
        #   see https://app.asana.com/0/1201461747883418/1201634225076144/f
        time.sleep(SLEEP_BEFORE_FREE)
        self._free()

    def _free(self):
        """Release all resources."""
        self.batches.free()
        self.messenger = None
        self.pkgs = None
        self.sims = None

    def start_sim(self, msg):
        """
        Registers a new simulation run and executes each package's simulation-level init.
        Context and state packages can optionally return custom Arrow loader and/or getter
        functions, which are later used internally by context and state objects, respectively,
        during task execution. (For example, loaders/getters returned by context packages
        can affect state package task execution, because state packages can use context
        objects. However, context packages can't affect the behavior of state objects.)

        If an error occurs during a package's custom simulation-level init (whether a
        package or user error), the error is sent to the Rust process and the simulation
        run is unregistered (with the expectation that the Rust process will also stop
        the simulation run).

        :param msg: The simulation-level initialization message from the Rust process.
                    Contains globals and the Arrow schema (both of which might differ
                    between simulation runs), and for each package, a custom payload
                    sent by the package's Rust code.
        """
        self.sims[msg.sim_id] = sim = Sim(msg.schema, self.experiment_ctx, msg.globals)
        sim_init_ctx = SimInitContext(
            self.experiment_ctx, sim.globals, sim.schema.agent
        )

        for pkg_id, pkg in self.pkgs.items():
            pkg.sims[msg.sim_id] = pkg_sim_data = {}

            if pkg.start_sim is not None:
                payload = msg.pkgs[pkg_id].payload

                try:
                    result = pkg.start_sim(
                        pkg.experiment, pkg_sim_data, payload, sim_init_ctx
                    )
                    if self._handle_sim_init_result(msg.sim_id, sim, pkg, result):
                        self.sims.pop(msg.sim_id)
                        return

                except Exception:
                    # Have to catch generic exception, because package could throw anything.
                    self._handle_pkg_error(pkg, "sim init", sys.exc_info(), msg.sim_id)
                    self.sims.pop(msg.sim_id)
                    return

    def _handle_sim_init_result(self, sim_id, sim, pkg, result):
        """
        :param sim_id: The new simulation run's id
        :param sim: The new simulation run's data
        :param pkg: The package object, with sim-level data
        :param result: What the package's custom sim init returned
        :return: Whether any user errors occurred during this
                 package's sim init
        """
        # Not checking for None as we are currently not consistent with returns from packages
        if not result:  # Package didn't return anything.
            return False

        if pkg.type in ("context", "state"):
            sim.maybe_add_custom_fns(result, "loaders", pkg)
            sim.maybe_add_custom_fns(result, "getters", pkg)

        # TODO: Remove duplication with experiment init result handling.
        prefix = f"Package `{pkg.name}` sim init: "
        warnings = result.get("warnings")
        if warnings is not None:
            warnings = tuple(prefix + w for w in warnings)
            self.messenger.send_user_warnings(warnings, sim_id)

        errors = result.get("errors")
        if errors is not None:
            errors = tuple(prefix + e for e in errors)
            self.messenger.send_user_errors(errors, sim_id)
            return True

        return False

    def run_task(self, sim_id, group_idx, pkg_id, task_id, task_msg):
        """
        Execute a package's task in a specific simulation run, optionally for
        a specific group:
            - Look up and execute the package's custom `run_task` function.
            - Handle errors and warnings.
            - If no errors occurred, flush Arrow data and propagate the message
            that the package returned to the next target (e.g. another runner).

        If an error does occur, it is sent to the Rust process and the
        simulation run is unregistered from the runner.

        :param sim_id: The id of the simulation run from which the task was sent
        :param group_idx: If the task should be executed on a single group's data
                          (i.e. single agent state and message batches), this is
                          the group's index. Otherwise, it's `None` -- indicating
                          that the task should be executed for the whole simulation
                          run.
        :param pkg_id: The id of the package from which the task was sent
        :param task_id: A unique id for this instance of this task -- this changes
                        each time the task is sent from the simulation run's main
                        loop to the runners, but stays the same while the task is
                        being sent between the runners, until the task is complete
                        and execution is returned to the simulation main loop.
        :param task_msg: An optional message chosen by the package's Rust code
        """
        sim = self.sims[sim_id]
        if group_idx is None:
            state = sim.state
            ctx = sim.context
        else:
            state = sim.state.get_group(group_idx)
            ctx = sim.context.get_group(group_idx)

        pkg = self.pkgs[pkg_id]
        try:
            # TODO: Pass `task_id` to package?
            continuation = (
                    pkg.run_task(pkg.experiment, pkg.sims[sim_id], task_msg, state, ctx)
                    or {}
            )
        except Exception:
            # Have to catch generic Exception, because package could throw anything.
            self._handle_pkg_error(pkg, "run_task", sys.exc_info(), sim_id)
            self.sims.pop(sim_id)
            return

        changes = state.flush_changes(sim.schema)
        if group_idx is not None:
            changes["i_group"] = group_idx
            changes = [changes]

        self.messenger.send_task_continuation(
            sim_id, changes, pkg_id, task_id, group_idx, continuation
        )
        # TODO: OPTIM chaining if `continuation.target == "Python"`

    def ctx_batch_sync(self, sim_id, ctx_batch, cur_step):
        """
        Load one simulation run's context batch's shared memory segment
        (if necessary) and native columns from Arrow. Also update the
        simulation run's current step.

        :param sim_id: ID of the simulation run whose context batch to sync
        :param ctx_batch: Object describing how to sync the context batch, with
                          the batch's id, batch version and memory version.
        :param cur_step: Current step of the simulation run -- synced along
                         with the batch because it's also part of context
        """
        sim = self.sims[sim_id]

        ctx_batch = self.batches.sync(ctx_batch, sim.schema.context)
        ctx_batch.load_missing_cols(sim.schema.context, sim.context_loaders)

        sim.context.set_batch(ctx_batch)
        sim.context.set_step(cur_step)

    def _load_pools(self, sim, agent_pool, message_pool):
        """
        Load batches corresponding to batch objects in pools,
        mutating both `self.batches` and `agent_pool`/`message_pool`.

        :param sim: Simulation run data, in particular schemas and custom loaders
        :param agent_pool: List of agent batch objects (i.e. objects with the agent schema)
        :param message_pool: List of message batch objects (i.e. objects with the message schema)
        """
        # `group_index` is used for `agent_pool` and `message_pool`. Using `range(len(..))` is more
        # readable as `enumerate(zip(...))`
        # pylint: disable=consider-using-enumerate
        for group_index in range(len(agent_pool)):
            agent_pool[group_index] = self.batches.sync(
                agent_pool[group_index], sim.schema.agent
            )
            agent_pool[group_index].load_missing_cols(
                sim.schema.agent, sim.state_loaders
            )

            message_pool[group_index] = self.batches.sync(
                message_pool[group_index], sim.schema.message
            )
            message_pool[group_index].load_missing_cols(
                sim.schema.message, sim.state_loaders
            )

    def state_sync(self, sim_id, agent_pool, message_pool):
        """
        Load one simulation run's current state's agent pool and message pool.
        Unlike an interim state sync, this can also update the sizes of the
        pools if the number of groups has changed.

        :param sim_id: ID of the simulation run whose state to sync
        :param agent_pool: List of state agent batch objects
        :param message_pool: List of state message (i.e. outbox) batch objects
        """
        sim = self.sims[sim_id]
        self._load_pools(sim, agent_pool, message_pool)
        sim.state.set_pools(agent_pool, message_pool, sim.state_loaders)

    def state_interim_sync(self, sim_id, group_idxs, agent_batches, message_batches):
        """
        Load a subset of one simulation run's state. This can only sync existing
        groups, so it can't change the number of groups.

        :param sim_id: ID of the simulation run whose state to sync
        :param group_idxs: Indices of groups within the simulation run's state
                           to sync
        :param agent_batches: State agent batch objects. The `i`th object must
                              correspond to the `i`th group to sync (i.e.
                              `agent_batches` and `group_idxs` must have the
                              same length), not the `i`th existing group.
        :param message_batches: State message batch objects
        """
        sim = self.sims[sim_id]
        for idx, group_idx in enumerate(group_idxs):
            agent_batch = self.batches.sync(agent_batches[idx], sim.schema.agent)
            agent_batch.load_missing_cols(sim.schema.agent, sim.state_loaders)

            msg_batch = self.batches.sync(message_batches[idx], sim.schema.message)
            msg_batch.load_missing_cols(sim.schema.message, {})

            group_state = sim.state.get_group(group_idx)
            group_state.set_batches(agent_batch, msg_batch)

    def state_snapshot_sync(self, sim_id, agent_pool, message_pool):
        sim = self.sims[sim_id]
        self._load_pools(sim, agent_pool, message_pool)
        sim.context.set_snapshot(agent_pool, message_pool)

    def run(self):
        # pylint: disable=too-many-branches
        """
        Wait for and handle messages from Rust process until
        a termination message is received or a fatal error occurs.
        Messages are always handled sequentially -- the runner
        finishes handling one message before receiving another.
        """
        try:
            while True:
                msg, msg_type = self.messenger.recv()
                # TODO: try and use `match` when we upgrade to Python 3.10+
                if msg_type == RunnerInboundMsgPayload.TerminateRunner:
                    logging.debug("Terminating runner")
                    break

                if msg_type == RunnerInboundMsgPayload.NewSimulationRun:
                    logging.debug("Starting simulation run")
                    self.start_sim(msg)

                elif msg_type == RunnerInboundMsgPayload.TerminateSimulationRun:
                    logging.debug("Terminating simulation run")
                    del self.sims[msg.sim_id]

                elif msg_type == RunnerInboundMsgPayload.ContextBatchSync:
                    logging.debug("Handling context batch sync")
                    self.ctx_batch_sync(msg.sim_id, msg.batch, msg.cur_step)

                elif msg_type == RunnerInboundMsgPayload.StateSync:
                    logging.debug("Handling state sync")
                    self.state_sync(msg.sim_id, msg.agent_pool, msg.message_pool)
                    self.messenger.send_sync_completion(msg.sim_id)

                elif msg_type == RunnerInboundMsgPayload.StateInterimSync:
                    logging.debug("Handling state interim sync")
                    self.state_interim_sync(
                        msg.sim_id,
                        msg.group_idxs,
                        msg.agent_batches,
                        msg.message_batches,
                    )

                elif msg_type == RunnerInboundMsgPayload.StateSnapshotSync:
                    logging.debug("Handling snapshot sync")
                    self.state_snapshot_sync(
                        msg.sim_id, msg.agent_pool, msg.message_pool
                    )

                elif msg_type == RunnerInboundMsgPayload.TaskMsg:
                    logging.debug("Running task")
                    n_groups = self.sims[msg.sim_id].state.n_groups()

                    group_idx = None
                    if n_groups == 1:
                        group_idx = msg.sync.group_idxs[0]
                    elif len(msg.sync.group_idxs) != n_groups:
                        # TODO
                        raise NotImplementedError(
                            "Tasks on arbitrary subsets of groups are not supported currently"
                        )

                    self.state_interim_sync(
                        msg.sim_id,
                        msg.sync.group_idxs,
                        msg.sync.agent_batches,
                        msg.sync.message_batches,
                    )
                    self.run_task(
                        msg.sim_id, group_idx, msg.pkg_id, msg.task_id, msg.payload
                    )

                elif msg_type == RunnerInboundMsgPayload.CancelTask:
                    pass  # TODO: CancelTask isn't used for now

                else:
                    raise RuntimeError(f"Unknown message type: {msg_type}")

        except Exception:
            # Catch generic Exception to make sure it's logged before the runner exits.
            self._handle_runner_error(sys.exc_info())

        self._free()

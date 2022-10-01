import sys
import time

# TODO: deserialize JSON on the Rust side (don't serialize it in the first
# place, just convert directly to Python objects using PyO3)
import json
import pyarrow as pa

from batch import Batches
from context import ExperimentContext, SimInitContext
from sim import Sim
from util import format_exc_info

"""
Amount of seconds to sleep before freeing resources.
"""
SLEEP_BEFORE_FREE = 2


# We want to catch everything
# pylint: disable=broad-except
class Runner:
    def __init__(self):
        self.batches = Batches()
        # TODO: should self.sims be a list?
        self.sims = {}
        self.pkgs = {}
        self.experiment_ctx = None

    def start_experiment(self, datasets, package_init_msgs, package_functions):
        datasets_builder = {}
        for (key, value) in datasets.items():
            datasets_builder[key] = json.loads(value)
        self.experiment_ctx = ExperimentContext(datasets_builder)

        user_warnings = []
        user_errors = []

        for (msg, fns) in zip(package_init_msgs, package_functions):
            package_start_experiment = fns["start_experiment"]
            pkg = self.pkgs[msg["id"]] = {
                "name": msg["name"],
                "type": msg["type"],
                "owns_field": set(),
                "start_experiment": package_start_experiment,
                "start_sim": fns["start_sim"],
                "run_task": fns["run_task"],
                "experiment": {},
                "sims": {},
            }
            if package_start_experiment:
                payload = json.loads(msg["payload"])
                try:
                    result = package_start_experiment(
                        pkg["experiment"], payload, self.experiment_ctx
                    )
                    warnings = result.get("warnings")
                    if warnings is not None:
                        user_warnings.extend(warnings)
                except Exception:
                    pkg_name = pkg["name"]
                    origin = "experiment init"
                    exc_info = sys.exc_info()
                    error = (
                        f"Package `{pkg_name}` {origin}: {format_exc_info(exc_info)}"
                    )
                    user_errors.push(error)

        return {"user_warnings": user_warnings, "user_errors": user_errors}

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
        # self.messenger = None
        self.pkgs = None
        self.sims = None

    def start_sim(
        self,
        sim_id,
        agent_schema_bytes,
        msg_schema_bytes,
        ctx_schema_bytes,
        package_ids,
        package_messages,
        globals,
    ):
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
        self.sims[sim_id] = sim = Sim(
            {
                "agent": pa.ipc.read_schema(pa.py_buffer(agent_schema_bytes)),
                "message": pa.ipc.read_schema(pa.py_buffer(msg_schema_bytes)),
                "context": pa.ipc.read_schema(pa.py_buffer(ctx_schema_bytes)),
            },
            self.experiment_ctx,
            globals,
        )
        sim_init_ctx = SimInitContext(
            self.experiment_ctx,
            globals,
            pa.ipc.read_schema(pa.py_buffer(agent_schema_bytes)),
        )

        user_warnings = []
        user_errors = []

        for i, (pkg_id, pkg) in enumerate(self.pkgs.items()):
            pkg["sims"][sim_id] = pkg_sim_data = {}

            if pkg["start_sim"] is not None:
                payload = package_messages[i]

                try:
                    result = pkg["start_sim"](
                        pkg["experiment"], pkg_sim_data, payload, sim_init_ctx
                    )
                    if self._handle_sim_init_result(
                        sim, pkg, result, user_warnings, user_errors
                    ):
                        self.sims.pop(str(sim_id))
                        return {
                            "user_warnings": user_warnings,
                            "user_errors": user_errors,
                        }

                # Have to catch generic exception, because package could throw anything.
                except Exception:
                    exc_info = sys.exc_info()
                    user_errors.push(
                        f"Package `{pkg.name}` sim init: {format_exc_info(exc_info)}"
                    )
                    self.sims.pop(str(sim_id))
                    return {"user_errors": user_errors, "user_warnings": user_warnings}
        
        return {"user_errors": user_errors, "user_warnings": user_warnings}

    def _handle_sim_init_result(self, sim, pkg, result, user_warnings, user_errors):
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

        if pkg["type"] in ("context", "state"):
            sim.maybe_add_custom_fns(result, "loaders", pkg)
            sim.maybe_add_custom_fns(result, "getters", pkg)

        # TODO: Remove duplication with experiment init result handling.
        pkg_name = pkg["name"]
        prefix = f"Package `{pkg_name}` sim init: "
        warnings = result.get("warnings")
        if warnings is not None:
            warnings = [prefix + w for w in warnings]
            user_warnings.extend(warnings)
        errors = result.get("errors")
        if errors is not None:
            errors = [prefix + e for e in errors]
            user_errors.extend(errors)
            return True

        return False

    def run_task(self, sim_id, group_idx, pkg_id, task_msg):
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
        task_msg = json.loads(task_msg)

        sim = self.sims[str(sim_id)]
        if group_idx is None:
            state = sim.state
            ctx = sim.context
        else:
            state = sim.state.get_group(group_idx)
            ctx = sim.context.get_group(group_idx)

        user_errors = []
        pkg = self.pkgs[pkg_id]
        try:
            # TODO: Pass `task_id` to package?
            continuation = (
                pkg["run_task"](
                    pkg["experiment"], pkg["sims"][str(sim_id)], task_msg, state, ctx
                )
                or {}
            )
        except Exception:
            # Have to catch generic Exception, because package could throw anything.
            pkg_name = pkg["name"]
            origin = "run_task"
            exc_info = sys.exc_info()
            error = f"Package `{pkg_name}` {origin}: {format_exc_info(exc_info)}"
            user_errors.append(error)
            self.sims.pop(str(sim_id))
            return

        changes = state.flush_changes(sim.schema)
        if group_idx is not None:
            changes["i_group"] = group_idx
            changes = [changes]

        # TODO: OPTIM chaining if `continuation.target == "Python"`
        # NOTE: this should probably be implemented on the Rust side
        ret = {
            "changes": changes,
            "user_warnings": [],
            "user_errors": user_errors,
            **continuation,
        }
        if not "task" in ret:
            ret["task"] = "{}"
        return ret

    def ctx_batch_sync(self, sim_id, ctx_batch, state_group_start_indices, cur_step):
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
        sim = self.sims[str(sim_id)]

        ctx_batch = self.batches.sync(ctx_batch, sim.schema["context"])
        ctx_batch.load_missing_cols(sim.schema["context"], sim.context_loaders)

        sim.context.set_batch(ctx_batch)
        sim.context.set_step(cur_step)

    def _load_pools(self, sim: Sim, agent_pool, message_pool):
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
                agent_pool[group_index], sim.schema["agent"]
            )
            agent_pool[group_index].load_missing_cols(
                sim.schema["agent"], sim.state_loaders
            )

            message_pool[group_index] = self.batches.sync(
                message_pool[group_index], sim.schema["message"]
            )
            message_pool[group_index].load_missing_cols(
                sim.schema["message"], sim.state_loaders
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
        sim = self.sims[str(sim_id)]
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
        sim = self.sims[str(sim_id)]
        for idx, group_idx in enumerate(group_idxs):
            agent_batch = self.batches.sync(agent_batches[idx], sim.schema["agent"])
            agent_batch.load_missing_cols(sim.schema["agent"], sim.state_loaders)

            msg_batch = self.batches.sync(message_batches[idx], sim.schema["message"])
            msg_batch.load_missing_cols(sim.schema["message"], {})

            group_state = sim.state.get_group(group_idx)
            group_state.set_batches(agent_batch, msg_batch)

    def state_snapshot_sync(self, sim_id, agent_pool, message_pool):
        # TODO: should self.sims be a list?
        sim = self.sims[str(sim_id)]
        self._load_pools(sim, agent_pool, message_pool)
        sim.context.set_snapshot(agent_pool, message_pool)

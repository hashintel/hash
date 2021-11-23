import logging
import sys
import time
import traceback
from pathlib import Path

from batch import Batches
from context import SimInitContext
from sim import Sim
from message import Messenger, MESSAGE_TYPE, PACKAGE_TYPE


class Package:
    def __init__(self, name, pkg_type, owned_fields, fns):
        self.name = name
        self.type = pkg_type
        self.owns_field = set(owned_fields)

        self.start_experiment = fns[0]
        self.start_sim = fns[1]
        self.run_task = fns[2]

        # `experiment` argument to package functions, initialized as empty dict.
        self.experiment = {}

        # `sim` arguments to sim-level (start_sim, run_task) package functions,
        # initialized as empty dicts.
        self.sims = {}


def get_pkg_path(pkg_name, pkg_type):
    return Path("../../simulation/package/{}/packages/{}/package.py".format(
        pkg_type, pkg_name
    ))


def load_fns(pkg_name, pkg_type):
    # Read code.
    path = get_pkg_path(pkg_name, pkg_type)
    code = path.read_text()

    # Run code.
    pkg_globals = {}
    bytecode = compile(code.decode("utf-8"), pkg_name, "exec")
    exec(bytecode, pkg_globals)

    # Extract functions.
    fn_names = ["start_experiment", "start_sim", "run_task"]
    fns = [(name, pkg_globals.get(name)) for name in fn_names]

    # Validate functions.
    for (fn_name, fn) in fns:
        if fn is not None and not callable(fn):
            raise Exception(
                "Couldn't import package {}: {} should be callable, not {}".format(
                    pkg_name, fn_name, type(fn)
                )
            )
    return fns


class Runner:
    def __init__(self, experiment_id, worker_index):
        try:
            self.messenger = Messenger(experiment_id, worker_index)
        except Exception as e:
            # Can't do much if messenger init fails.
            logging.error("Messenger init failed: " + str(e))
            raise e

        try:
            self.start_experiment()
        except Exception as e:  # Have to catch generic Exception
            self.handle_runner_error(e, sys.exc_info())
            raise e

    def start_experiment(self):
        init = self.messenger.recv_init()

        self.batches = Batches()
        self.experiment_ctx = init.shared_ctx
        self.sims = {}

        self.pkgs = {}
        for pkg_id, config in init.pkgs.items():
            fns = load_fns(config.name, config.type)

            self.pkgs[pkg_id] = pkg = Package(
                name=config.name,
                pkg_type=config.type,
                owned_fields=config.owned_fields,
                fns=fns
            )

            if pkg.start_experiment is not None:
                pkg.start_experiment(
                    pkg.experiment, config.payload, self.experiment_ctx
                )

    def start_sim(self, sim_id, schema, pkg_msgs, sim_globals):
        sim = self.sims[sim_id] = Sim(schema, self.experiment_ctx, sim_globals)
        init_ctx = SimInitContext(self.experiment_ctx, sim_globals, schema.agent)
        for pkg_id, msg in pkg_msgs.items():
            pkg = self.pkgs[pkg_id]
            pkg_sim = pkg.sims[sim_id] = {}
            if pkg.start_sim is not None:
                # TODO: try/except around pkg.start_sim, send pkg error back to Rust
                r = pkg.start_sim(pkg.experiment, pkg_sim, msg.payload, init_ctx)
                if r and (pkg.type == "context" or pkg.type == "state"):
                    sim.maybe_add_custom_fns(r, "loaders", pkg)
                    sim.maybe_add_custom_fns(r, "getters", pkg)

    def run_task(self, sim_id, i_group, pkg_id, task_msg):
        sim = self.sims[sim_id]
        if i_group is None:
            state = sim.state
            ctx = sim.ctx
        else:
            state = sim.state.get_group(i_group)
            ctx = sim.ctx.get_group(i_group)

        pkg = self.pkgs[pkg_id]
        try:
            continuation = pkg.run_task(pkg.experiment, pkg.sims[sim_id], task_msg, state, ctx)

        except Exception as e:
            # Have to catch generic Exception, because package could throw anything.

            tb = str(traceback.format_exception(type(e), e, sys.exc_info()))
            error = "Package {} error: {}".format(pkg.name, tb)
            # TODO: Custom log level(s) for non-engine (i.e. package/user) errors/warnings,
            #       e.g. `logging.external_error`?
            logging.error(error)
            self.messenger.send_pkg_error(error)
            return

        changes = state.flush_changes()
        self.messenger.send_task_continuation(continuation, changes)
        # TODO: chaining if `continuation.target == "py"` for better performance

    def ctx_batch_sync(self, sim_id, ctx_batch, group_start_idxs):
        sim = self.sims[sim_id]

        ctx_batch = self.batches.sync(ctx_batch, sim.schema.ctx)
        ctx_batch.load_missing_cols(sim.schema.ctx, sim.ctx_loaders)

        sim.ctx.ctx_batch = ctx_batch
        sim.ctx.group_start_idxs = group_start_idxs

    def state_interim_sync(self, sim_id, group_idxs, agent_batches, message_batches):
        sim = self.sims[sim_id]
        for i, i_group in enumerate(group_idxs):
            group_state = sim.state[i_group]

            group_state.agent_batch = self.batches.sync(agent_batches[i], sim.schema.agent)
            group_state.agent_batch.load_missing_cols(sim.schema.agent, sim.state_loaders)

            group_state.msg_batch = self.batches.sync(message_batches[i], sim.schema.msg)
            group_state.msg_batch.load_missing_cols(sim.schema.msg, {})

    # TODO: rename to terminate?
    def kill(self):
        self.batches.free()
        del self.messenger

    def handle_runner_error(self, exc, tb):
        # User errors definitely need to be sent back to the Rust process, so
        # they can be sent further to the user and displayed.

        # Package error sending is more of a nice-to-have, but helps users
        # report bugs to package authors. 

        # Runner errors just need to reach our logs, so their contents don't
        # really need to be sent back, but it's still good to notify the
        # Rust process that a runner error occurred so it immediately knows
        # that the runner exited.

        error = "Runner error: " + str(traceback.format_exception(type(exc), exc, tb))
        logging.error(error)  # First make sure the error gets logged; then try to send it.
        self.messenger.send_runner_error(error)
        time.sleep(2)  # Give the Rust process time to receive the error message.
        self.kill()

    def run(self):
        try:
            while True:
                msg, t = self.messenger.recv()
                if t == MESSAGE_TYPE.TerminateRunner:
                    self.kill()
                    break

                if t == MESSAGE_TYPE.NewSimulationRun:
                    self.start_sim(msg.sim_id, msg.schema, msg.ctx_pkgs, msg.state_pkgs)

                if t == MESSAGE_TYPE.TerminateSimulationRun:
                    del self.sims[msg.sim_id]

                if t == MESSAGE_TYPE.ContextBatchSync:
                    self.ctx_batch_sync(msg.sim_id, msg.ctx_batch, msg.group_start_idxs)

                if t == MESSAGE_TYPE.StateSync:
                    self.state_sync(msg.sim_id, msg.agent_pool, msg.msg_pool)

                if t == MESSAGE_TYPE.StateInterimSync:
                    self.state_interim_sync(
                        msg.sim_id, msg.group_idxs, msg.agent_batches, msg.msg_batches
                    )

                if t == MESSAGE_TYPE.StateSnapshotSync:
                    self.state_snapshot_sync(msg.sim_id, msg.agent_pool, msg.msg_pool)

                if t == MESSAGE_TYPE.RunTask:
                    self.run_task(msg.sim_id, msg.i_group, msg.pkg_id, msg.task)

                if t == MESSAGE_TYPE.CancelTask:
                    self.cancel_task(msg.sim_id, msg.task_id)

        except Exception as e:
            # Catch generic Exception to make sure it's logged before the runner exits.
            self.handle_runner_error(e, sys.exc_info())

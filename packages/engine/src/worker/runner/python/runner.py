import logging
import sys
import time
import traceback

from batch import Batches
from context import SimInitContext
from package import Package
from sim import Sim
from message import Messenger, MESSAGE_TYPE


class Runner:
    def __init__(self, experiment_id, worker_index):
        try:
            self.messenger = Messenger(experiment_id, worker_index)
        except Exception as e:
            # Can't do much if messenger init fails.
            logging.error("Messenger init failed: " + str(e))
            raise e

        self.batches = Batches()
        self.sims = {}
        self.pkgs = {}

        try:
            self.experiment_ctx = self.start_experiment()
        except Exception as e:  # Have to catch generic Exception
            self.handle_runner_error(sys.exc_info())
            raise e

    def start_experiment(self):
        init = self.messenger.recv_init()
        experiment_ctx = init.shared_ctx
        for pkg_id, config in init.pkgs.items():
            self.pkgs[pkg_id] = pkg = Package(
                name=config.name,
                pkg_type=config.type,
                owned_fields=[]  # TODO: Propagate `config.owned_fields` here.
            )

            if pkg.start_experiment is not None:
                pkg.start_experiment(
                    pkg.experiment, config.payload, experiment_ctx
                )

        return experiment_ctx

    def start_sim(self, msg):
        self.sims[msg.sim_id] = sim = Sim(msg.schema, self.experiment_ctx, msg.globals)
        sim_init_ctx = SimInitContext(self.experiment_ctx, sim.globals, sim.schema.agent)
        for pkg_id, pkg in self.pkgs.items():
            pkg.sims[msg.sim_id] = pkg_sim_data = {}
            if pkg.start_sim is not None:
                payload = msg.pkgs[pkg_id].payload
                try:
                    r = pkg.start_sim(pkg.experiment, pkg_sim_data, payload, sim_init_ctx)
                    if r and (pkg.type == "context" or pkg.type == "state"):
                        sim.maybe_add_custom_fns(r, "loaders", pkg)
                        sim.maybe_add_custom_fns(r, "getters", pkg)
                except Exception as e:  # Have to catch anything
                    # TODO: Better error string
                    self.messenger.send_pkg_error(str(e))

    def run_task(self, sim_id, group_idx, pkg_id, task_id, task_msg):
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
            continuation = pkg.run_task(pkg.experiment, pkg.sims[sim_id], task_msg, state, ctx) or {}

        except Exception as e:
            # Have to catch generic Exception, because package could throw anything.

            tb = str(traceback.format_exception(type(e), e, sys.exc_info()))
            error = "Package {} error: {}".format(pkg.name, tb)
            # TODO: Custom log level(s) for non-engine (i.e. package/user) errors/warnings,
            #       e.g. `logging.external_error`?
            logging.error(error)
            self.messenger.send_pkg_error(error)
            return

        changes = state.flush_changes(sim.schema)
        self.messenger.send_task_continuation(
            sim_id,
            changes,
            pkg_id,
            task_id,
            continuation
        )
        # TODO: chaining if `continuation.target == "py"` for better performance

    def ctx_batch_sync(self, sim_id, batch, cur_step):
        sim = self.sims[sim_id]

        ctx_batch = self.batches.sync(batch, sim.schema.context)
        ctx_batch.load_missing_cols(sim.schema.context, sim.context_loaders)

        sim.context.set_batch(ctx_batch)
        sim.context.set_step(cur_step)

    def state_sync(self, sim_id, agent_pool, message_pool):
        sim = self.sims[sim_id]
        for i_group in range(len(agent_pool)):
            agent_pool[i_group] = self.batches.sync(agent_pool[i_group], sim.schema.agent)
            agent_pool[i_group].load_missing_cols(sim.schema.agent, sim.state_loaders)

            message_pool[i_group] = self.batches.sync(message_pool[i_group], sim.schema.message)
            message_pool[i_group].load_missing_cols(sim.schema.message, sim.state_loaders)

        sim.state.set_pools(agent_pool, message_pool, sim.state_loaders)

    def state_interim_sync(self, sim_id, group_idxs, agent_batches, message_batches):
        sim = self.sims[sim_id]
        for i, group_idx in enumerate(group_idxs):
            agent_batch = self.batches.sync(agent_batches[i], sim.schema.agent)
            agent_batch.load_missing_cols(sim.schema.agent, sim.state_loaders)

            msg_batch = self.batches.sync(message_batches[i], sim.schema.msg)
            msg_batch.load_missing_cols(sim.schema.msg, {})

            group_state = sim.state.get_group(group_idx)
            group_state.set_batches(agent_batch, msg_batch)

    def state_snapshot_sync(self, sim_id, agent_pool, msg_pool):
        self.sims[sim_id].context.set_snapshot(agent_pool, msg_pool)

    # TODO: rename to terminate?
    def kill(self):
        self.batches.free()
        self.messenger = None

    # `exc_info` is whatever tuple of info `sys.exc_info()` returned about
    # an exception. Calling `sys.exc_info()` inside `handle_runner_error`
    # wouldn't work, because `sys.exc_info` can only return info about an
    # exception that has just occurred.
    def handle_runner_error(self, exc_info):
        # User errors definitely need to be sent back to the Rust process, so
        # they can be sent further to the user and displayed.

        # Package error sending is more of a nice-to-have, but helps users
        # report bugs to package authors. 

        # Runner errors just need to reach our logs, so their contents don't
        # really need to be sent back, but it's still good to notify the
        # Rust process that a runner error occurred so it immediately knows
        # that the runner exited.

        error = "Runner error: " + str(traceback.format_exception(*exc_info))
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
                    self.start_sim(msg)

                if t == MESSAGE_TYPE.TerminateSimulationRun:
                    del self.sims[msg.sim_id]

                if t == MESSAGE_TYPE.ContextBatchSync:
                    self.ctx_batch_sync(msg.sim_id, msg.batch, msg.cur_step)

                if t == MESSAGE_TYPE.StateSync:
                    self.state_sync(msg.sim_id, msg.agent_pool, msg.message_pool)

                if t == MESSAGE_TYPE.StateInterimSync:
                    self.state_interim_sync(
                        msg.sim_id, msg.group_idxs, msg.agent_batches, msg.message_batches
                    )

                if t == MESSAGE_TYPE.StateSnapshotSync:
                    self.state_snapshot_sync(msg.sim_id, msg.agent_pool, msg.msg_pool)

                if t == MESSAGE_TYPE.TaskMsg:
                    n_groups = self.sims[msg.sim_id].state.n_groups()

                    group_idx = None
                    if n_groups == 1:
                        group_idx = msg.sync.group_idxs[0]
                    elif len(msg.sync.group_idxs) != n_groups:
                        # TODO
                        raise RuntimeError(
                            "Tasks on arbitrary subsets of groups are not supported currently"
                        )

                    self.run_task(msg.sim_id, group_idx, msg.pkg_id, msg.task_id, msg.payload)

                if t == MESSAGE_TYPE.CancelTask:
                    pass  # TODO: CancelTask isn't used for now

        except Exception as e:
            # Catch generic Exception to make sure it's logged before the runner exits.
            self.handle_runner_error(sys.exc_info())

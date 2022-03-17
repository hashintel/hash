import hash_util


class AgentContext:
    def __init__(self, sim_ctx, ctx_batch, state_snapshot, i_agent_in_sim):
        # The context batch is sim-wide, so hide it from the user.
        # (The user should only see one current agent through an AgentContext object.)
        self.__sim_ctx = sim_ctx
        self.__getters = sim_ctx.getters  # Used often
        self.__cols = ctx_batch.cols
        self.state_snapshot = state_snapshot
        self.__idx_in_sim = i_agent_in_sim  # (As opposed to agent index in its group)

    def to_json(self):
        r = {}
        for field_name in self.__cols:
            r[field_name] = hash_util.json_deepcopy(self.__getattr__(field_name))
        return r

    def globals(self):
        return self.__sim_ctx.globals()

    def data(self):
        return self.__sim_ctx.data()

    def step(self):
        return self.__sim_ctx.step()

    def __getattr__(self, field_name):
        print(f"__getattr__ cols: {self.__dict__['_AgentContext__cols']}")
        elem = self.__dict__['_AgentContext__cols'][field_name][self.__dict__['_AgentContext__idx_in_sim']]
        getter = self.__dict__['_AgentContext__getters'].get(field_name)
        return elem if getter is None else getter(self, elem)

    # Context is immutable, so there's no `__setattr__`.


class GroupContext:
    def __init__(self, sim_ctx, ctx_batch, state_snapshot, group_start_idx):
        # The context batch is sim-wide, so hide it from the user.
        # (The user should only see one current group through a GroupContext object.)
        self.__sim_ctx = sim_ctx
        self.__ctx_batch = ctx_batch
        self.state_snapshot = state_snapshot
        self.__start_idx = group_start_idx

    def get_agent(self, i_agent_in_group, old_agent_ctx=None):
        idx_in_sim = i_agent_in_group + self.__start_idx
        if old_agent_ctx is not None:  # Reuse AgentContext object for performance.
            old_agent_ctx.__AgentContext_idx_in_sim = idx_in_sim
            return old_agent_ctx

        return AgentContext(
            self.__sim_ctx, self.__ctx_batch, self.state_snapshot, idx_in_sim
        )

    def globals(self):
        return self.__sim_ctx.globals()

    def data(self):
        return self.__sim_ctx.data()

    def step(self):
        return self.__sim_ctx.step()


class Snapshot:
    def __init__(self, agent_pool, message_pool):
        self.agent_pool = agent_pool
        self.message_pool = message_pool


class SimContext:
    def __init__(self, getters, experiment_ctx, sim_globals):
        self.getters = getters
        self.__step = 0
        self.__experiment_ctx = experiment_ctx
        self.__globals = sim_globals
        self.__ctx_batch = None
        self.state_snapshot = Snapshot(None, None)

    # Invalidates existing `GroupContext` and `AgentContext` objects.
    def set_batch(self, ctx_batch):
        self.__ctx_batch = ctx_batch
        # TODO: group state agent index --> sim context agent index

    # Invalidates existing `GroupContext` and `AgentContext` objects.
    def set_snapshot(self, agent_pool, message_pool):
        self.state_snapshot.agent_pool = agent_pool
        self.state_snapshot.message_pool = message_pool

    def set_step(self, cur_step):
        self.__step = cur_step

    # TODO: step getter method

    def get_group(self, i_group):
        return GroupContext(
            self,
            self.__ctx_batch,
            self.state_snapshot,
            i_group
        )

    def get_agent(self, i_agent_in_sim, old_agent_ctx=None):
        if old_agent_ctx is not None:  # Reuse AgentContext object for performance.
            old_agent_ctx.__AgentContext_idx_in_sim = i_agent_in_sim
            return old_agent_ctx

        return AgentContext(
            self, self.__ctx_batch, self.state_snapshot, i_agent_in_sim
        )

    def globals(self):
        return self.__globals

    def data(self):
        return self.__experiment_ctx.data()

    def step(self):
        return self.__step


class SimInitContext:
    def __init__(self, experiment_ctx, sim_globals, agent_schema):
        self.__experiment_ctx = experiment_ctx
        self.__globals = sim_globals  # TODO: Freeze somehow
        self.agent_schema = agent_schema

    def globals(self):
        return self.__globals

    def data(self):
        return self.__experiment_ctx.data()


class ExperimentContext:
    def __init__(self, datasets):
        self.__datasets = datasets  # TODO: Freeze somehow

    def data(self):
        return self.__datasets

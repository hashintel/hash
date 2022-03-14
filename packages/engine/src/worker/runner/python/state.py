from copy import deepcopy
from uuid import UUID

import hash_util
import json

def raise_missing_field(field_name):
    raise RuntimeError("Missing field (behavior keys?): " + field_name)


class AgentState:
    def __init__(self, group_state, i_agent_in_group):
        self.__group_state = group_state
        self.__cols = group_state.__GroupState_agent_batch.cols
        self.__msgs = group_state.__GroupState_msg_batch.cols['messages']
        self.__msgs_native = group_state.__GroupState_msgs_native
        self.__idx_in_group = i_agent_in_group
        self.__dyn_access = False

    # TODO: It's possible that we don't want package users to
    #       have access to this, though we do want package
    #       authors to.
    def set_dynamic_access(self, enable_dynamic_access):
        self.__dyn_access = enable_dynamic_access

    def to_json(self):
        r = {}
        for name, col in self.__cols.items():
            r[name] = hash_util.json_deepcopy(self.__getattr__(name))

        r['messages'] = hash_util.json_deepcopy(self.messages)
        return r

    def _hasattr(self, field):
        return field == "messages" or field in self.__cols

    def __getattr__(self, field):  # Can raise AttributeError.
        idx = self.__dict__['__idx_in_group']
        if field == "messages":
            msgs = self.__dict__['__msgs'][idx]
            if not self.__dict__['__msgs_native'][idx]:
                for m in msgs:
                    m["data"] = json.loads(m["data"])
                self.__dict__['__msgs_native'][idx] = True

            return msgs

        if field == "agent_id":
            return str(UUID(bytes=self.__dict__['__cols']["agent_id"][idx]))

        col = self.__dict__['__cols'].get(field)
        if col is None:  # Slow path -- unlikely branch
            if self.__dict__['__dyn_access']:
                self.__dict__['__cols'][field] = col = self.__group_state.load(field)
            else:
                raise_missing_field(field)

        return col[idx]

    def __setattr__(self, field, value):  # Can raise AttributeError.
        idx = self.__dict__['__idx_in_group']
        if field == "messages":
            self.__dict__['__msgs'][idx] = value
            self.__dict__['__msgs_native'][idx] = True
            return

        # TODO: Prevent users from setting `agent_id` field?
        #       (Throw exception -- maybe ValueError or AttributeError.)

        col = self.__dict__['__cols'].get(field)
        if col is None:  # Slow path -- unlikely branch
            self.__dict__['__cols'][field] = col = self.__group_state.load(field)

        col[idx] = value

    def get(self, field_name):
        return hash_util.json_deepcopy(self.__getattr__(field_name))

    def set(self, field_name, value):
        self.__setattr__(field_name, hash_util.json_deepcopy(value))

    def modify(self, field_name, fn):
        self.set(field_name, fn(self.get(field_name)))

    # Similarly to `get` and `set`, if the user mutates the arguments
    # of `addMessage` later, it won't affect the agent's state.

    # `to` must be either a string or a list. If it's a string,
    # it must be a single agent id or name. If it's a list, it must
    # be a list of agent ids and/or names. `to` is automatically
    # converted to a list if it's not one already.

    # `data` is an optional argument. `data` must be JSON-serializable.
    def add_message(self, to, msg_type, data=None):
        idx = self.__idx
        self.__dict__['__msgs'][idx].append({
            "to": [to] if isinstance(to, str) else to,
            "type": msg_type,
            "data": deepcopy(data) if self.__dict__['__msgs_native'][idx] else json.dumps(data)
        })

    # Returns the index of the currently executing behavior in the agent's behavior chain.
    def behavior_index(self):
        return self.__i_behavior


class GroupState:
    def __init__(self, agent_batch, msg_batch, loaders):
        self.__agent_batch = agent_batch
        self.__msg_batch = msg_batch
        # TODO: Use numpy for msgs_native
        self.__msgs_native = [False * len(agent_batch.cols['agent_id'])]
        self.__loaders = loaders

    def set_batches(self, agent_batch, msg_batch):
        self.__agent_batch = agent_batch
        self.__msg_batch = msg_batch
        self.__msgs_native = [False * len(agent_batch.cols['agent_id'])]

    def to_json(self):
        raise RuntimeError("Group state shouldn't be copied to JSON.")

    def load(self, field_name):
        if self.__agent_batch.record_batch.schema.get_field_index(field_name) < 0:
            raise_missing_field(field_name)  # Missing even with dynamic access

        return self.__agent_batch.load_col(field_name, self.__loaders.get(field_name))

    # Returns the number of agents in this group.
    def n_agents(self):
        return self.__agent_batch.record_batch.num_rows

    def get_agent(self, i_agent_in_group, old_agent_state=None):
        if old_agent_state is not None:
            old_agent_state.__AgentState_idx = i_agent_in_group
            return old_agent_state

        return AgentState(self, i_agent_in_group)

    def flush_changes(self, schema):
        # TODO: Only flush columns that were written to.
        #       (Set written flag in `state.set` and `state.addMessage`.)
        # TODO: Only flush columns that can't be written to in-place.
        # TODO: Don't flush columns that only need to be read, not written.

        # `msgs_native[i] == 0` doesn't mean that the i-th agent's
        # outbox wasn't written to -- `state.addMessage` can convert
        # a message's data to JSON and add it without converting existing
        # messages to native JavaScript objects.

        skip = {'agent_id': True}
        self.__agent_batch.flush_changes(schema.agent, skip)

        # Convert any native message objects to JSON before flushing message batch.
        # Note that this is distinct from (though analogous to) 'any'-type handling
        # in `batch.flush_changes`.
        group_msgs = self.__msg_batch.cols['messages']
        for i_agent, agent_msgs in enumerate(group_msgs):
            if self.__msgs_native[i_agent]:
                for msg in agent_msgs:
                    msg.data = json.dumps(msg.data)

        self.__msg_batch.flush_changes(schema.message, {})

        return {
            "agent": self.__agent_batch,
            "message": self.__msg_batch
        }


class SimState:
    def __init__(self, getters):
        self.getters = getters
        self.groups = []

    def n_groups(self):
        return len(self.groups)

    def set_pools(self, agent_pool, msg_pool, loaders):
        for i_group in range(min(len(self.groups), len(agent_pool))):
            self.groups[i_group].set_batches(agent_pool[i_group], msg_pool[i_group])

        if len(self.groups) > len(agent_pool):
            for _ in range(len(agent_pool), len(self.groups)):
                self.groups.pop()

        elif len(self.groups) < len(agent_pool):
            for i_group in range(len(self.groups), len(agent_pool)):
                self.groups.append(
                    GroupState(agent_pool[i_group], msg_pool[i_group], loaders)
                )

    def get_group(self, i_group):
        return self.groups[i_group]

    def flush_changes(self, schema):
        r = []
        for i_group, group in enumerate(self.groups):
            changes = group.flush_changes(schema)
            changes["i_group"] = i_group
            r.append(changes)
        return r

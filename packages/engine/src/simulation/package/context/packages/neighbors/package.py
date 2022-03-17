from uuid import UUID


class Neighbor:
    # TODO: Fix previous location
    def __init__(self, state_snapshot, loc):
        self.__snapshot = state_snapshot
        # self.__prev_loc = prev_loc  # For looking up messages in snapshot message pool
        self.__loc = loc  # Batch index, neighbor index

    def __getitem__(self, field):
        if field == "messages":
            p = self.__prev_loc
            ret = self.__snapshot.message_pool[p[0]].cols["messages"][p[1]]

        ret = self.__snapshot.agent_pool[self.__loc[0].as_py()].cols[field][self.__loc[1].as_py()]
        if field == "agent_id":
            ret = str(UUID(bytes=ret))

        return ret

    def to_json(self):
        fields = {
            "messages": self.messages
        }

        cols = self.__snapshot.agent_pool[self.__loc[0]].cols
        for field, col in cols.items():
            fields[field_name] = col[self.__loc[1]]

        return fields


def _get_neighbors(agent_context, neighbor_locs):
    def neighbor_func():
        snapshot = agent_context.state_snapshot
        # TODO: Get _previous_index from the engine by passing it to the state-batch
        # prev_loc = agent_context._previous_index
        return [Neighbor(snapshot, loc) for loc in neighbor_locs]

    return neighbor_func


def start_sim(experiment, sim, init_message, init_context):
    loaders = {
        "neighbors": hash_util.load_shallow
    }
    getters = {
        "neighbors": _get_neighbors
    }
    return {
        "loaders": loaders,
        "getters": getters
    }

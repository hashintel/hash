from json import loads as json_loads
from uuid import UUID


class InboxMessage:
    def __init__(self, ctx_msg_pool, msg_loc):
        self.__pool = ctx_msg_pool
        self.__loc = msg_loc # i_group, i_agent, i_msg
        # (`i_msg` was index in  `agent_state.messages` on the previous step.)
        self.__data = None

    def to_json(self):
        return {
            "from": self["from"],
            "to": self["to"],
            "type": self["type"],
            "data": self["data"]
        }

    def __getitem__(self, key):
        loc = self.__loc # Local variable lookup is faster than global lookup.

        if key == "data":
            if self.__data is None:
                self.__data = json_loads(self.__pool[loc[0]].cols["messages"][loc[1]][loc[2]]["data"])
            return self.__data
        
        if key == "from":
            src = self.__pool[loc[0]].cols["from"][loc[1]]
            if type(src) == bytes:
                src = str(UUID(bytes=src))
            return src
        
        return self.__pool[loc[0]].cols["messages"][loc[1]][loc[2]][key]


def _get_msgs(agent_context, msg_locs):
    pool = agent_context.state_snapshot.message_pool
    msgs = [InboxMessage(pool, loc) for loc in msg_locs]
    
    try:
        msgs.extend(agent_context.api_responses)
    except AttributeError:
        pass  # Assume API responses package is disabled
    return msgs


def start_sim(experiment, sim, init_message, init_context):
    loaders = {
        "messages": hash_util.load_shallow
    }
    getters = {
        "messages": _get_msgs
    }
    return {
        "loaders": loaders,
        "getters": getters
    }

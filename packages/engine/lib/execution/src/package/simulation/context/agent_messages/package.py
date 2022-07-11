from json import loads as json_loads
from uuid import UUID


class InboxMessage:
    def __init__(self, ctx_msg_pool, msg_loc):
        self.__pool = ctx_msg_pool
        # group_idx, agent_idx, message_idx (`message_idx` was index in  `agent_state.messages` on
        # the previous step.)
        self.__loc = msg_loc
        self.__data = None

    def __getitem__(self, key):
        loc = self.__loc  # Local variable lookup is faster than global lookup.
        group_idx = loc[0].as_py()
        agent_idx = loc[1].as_py()
        message_idx = loc[2].as_py()

        if key == "data":
            if self.__data is None:
                self.__data = json_loads(
                    self.__pool[group_idx].cols["messages"][agent_idx][message_idx]["data"])
            return self.__data

        if key == "from":
            src = self.__pool[group_idx].cols["from"][agent_idx]
            if type(src) == bytes:
                src = str(UUID(bytes=src))
            return src

        return self.__pool[group_idx].cols["messages"][agent_idx][message_idx][key]


def _get_msgs(agent_context, msg_locs):
    """
    Returns a function for getting messages.
    """

    def messages():
        """
        We expect a function when calling `messages()`. This wraps the behavior in a function and
        returns that instead
        """
        pool = agent_context.state_snapshot.message_pool
        msgs = [InboxMessage(pool, loc) for loc in msg_locs]

        # TODO: Enable API responses package
        # msgs.extend(agent_context.api_responses)

        return msgs

    return messages


def start_sim(_experiment, _sim, _init_message, _init_context):
    return {
        "loaders": {},
        "getters": {
            "messages": _get_msgs
        }
    }

#
# Checks `state.index` to be equal to `state.behaviorIndex()`
#
def behavior(state, context):
    if state.behavior_index() != state["index"]:
        state["valid"] = False

    state["index"] += 1

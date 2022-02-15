def behavior(state, context):
    """Gets and sets a number fixed-size-array using set/get notation"""
    state.set("n1_is_list", type(state.get("n1")) is list)
    state.set("n1_0_is_number", type(state.get("n1")[0]) is float)

    state.set("n2", [state.get("n1")[0] * 5, state.get("n1")[1] * 10])
    state.set("n1", [state.get("n1")[0] * 10, state.get("n1")[1] * 20])

    state.set("n2_is_list", type(state.get("n1")) is list)
    state.set("n2_0_is_number", type(state.get("n2")[0]) is float)

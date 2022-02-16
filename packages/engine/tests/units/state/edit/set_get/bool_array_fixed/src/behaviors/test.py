def behavior(state, context):
    """Gets and sets a boolean fixed-size-array using set/get notation"""
    state.set("b1_is_list", type(state.get("b1")) is list)
    state.set("b1_0_is_boolean", type(state.get("b1")[0]) is bool)

    state.set("b2", [not state.get("b1")[0], not state.get("b1")[1]])

    state.set("b2_is_list", type(state.get("b1")) is list)
    state.set("b2_0_is_boolean", type(state.get("b2")[0]) is bool)

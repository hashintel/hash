def behavior(state, context):
    """Gets and sets a boolean array using set/get notation"""
    state.set("b1_is_list", type(state.get("b1")) is list)
    state.set("b1_0_is_boolean", type(state.get("b1")[0]) is bool)

    b1 = state.get("b1")

    state.set("b2", b1 + [True])
    b1.insert(0, False)

    state.set("b1", b1)

    state.set("b2_is_list", type(state.get("b2")) is list)
    state.set("b2_0_is_boolean", type(state.get("b2")[0]) is bool)

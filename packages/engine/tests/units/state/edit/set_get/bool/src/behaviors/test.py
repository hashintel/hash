def behavior(state, context):
    """Gets and sets a boolean value using set/get notation"""
    state.set("b1_is_boolean", type(state.get("b1")) is bool)

    b1 = state.get("b1")

    state.set("b2", b1 and True)
    state.set("b1", False)

    state.set("b2_is_boolean", type(state.get("b2")) is bool)

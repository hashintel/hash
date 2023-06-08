def behavior(state, context):
    """Gets and sets a number value using set/get notation"""
    state.set("n1_is_number", type(state.get("n1")) is float)

    n1 = state.get("n1")

    state.set("n2", n1 + 2)
    state.set("n1", 2)

    state.set("n2_is_number", type(state.get("n2")) is float)

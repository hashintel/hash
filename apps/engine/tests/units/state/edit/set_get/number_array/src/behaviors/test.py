def behavior(state, context):
    """Gets and sets a number array using set/get notation"""
    state.set("n1_is_list", type(state.get("n1")) is list)
    state.set("n1_0_is_number", type(state.get("n1")[0]) is float)

    n1 = state.get("n1")

    state.set("n2", n1 + [4])
    n1.insert(0, 0)

    state.set("n1", n1)

    state.set("n2_is_list", type(state.get("n1")) is list)
    state.set("n2_0_is_number", type(state.get("n2")[0]) is float)

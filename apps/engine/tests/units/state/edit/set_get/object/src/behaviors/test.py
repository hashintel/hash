def behavior(state, context):
    """Gets and sets an object value using set/get notation"""
    state.set("o1_is_struct", type(state.get("o1")) is dict)
    state.set("o1_n1_is_number", type(state.get("o1")["n1"]) is float)

    o1 = state.get("o1")

    o1["n2"] = o1["n1"] + 1
    o1["n1"] = 3

    state.set("o1", o1)

    state.set("o1_n2_is_number", type(state.get("o1")["n2"]) is float)

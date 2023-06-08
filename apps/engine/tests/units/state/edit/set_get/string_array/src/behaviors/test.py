def behavior(state, context):
    """Gets and sets a string array using set/get notation"""
    state.set("s1_is_list", type(state.get("s1")) is list)
    state.set("s1_0_is_string", type(state.get("s1")[0]) is str)

    s1 = state.get("s1")

    state.set("s2", s1 + ["buzz"])
    s1.insert(0, "bazz")

    state.set("s1", s1)

    state.set("s2_is_list", type(state.get("s1")) is list)
    state.set("s2_0_is_string", type(state.get("s2")[0]) is str)

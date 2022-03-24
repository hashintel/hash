def behavior(state, context):
    """Gets and sets a number fixed-size-array using set/get notation"""
    state.set("s1_is_list", type(state.get("s1")) is list)
    state.set("s1_0_is_string", type(state.get("s1")[0]) is str)
    state.set("s1_1_is_string", type(state.get("s1")[1]) is str)

    state.set("s2", [state.get("s1")[0] + "bar", state.get("s1")[1] + "foo"])
    state.set("s1", [state.get("s1")[0] + "boo", state.get("s1")[1] + "far"])

    state.set("s2_is_list", type(state.get("s2")) is list)
    state.set("s2_0_is_string", type(state.get("s2")[0]) is str)
    state.set("s2_1_is_string", type(state.get("s2")[1]) is str)

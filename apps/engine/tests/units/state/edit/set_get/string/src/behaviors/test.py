def behavior(state, context):
    """Gets and sets a string value using set/get notation"""
    state.set("s1_is_string", type(state.get("s1")) is str)

    s1 = state.get("s1")

    state.set("s2", s1 + " hat")
    state.set("s1", "beret")

    state.set("s2_is_string", type(state.get("s2")) is str)

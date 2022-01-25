def behavior(state, context):
    """Gets and sets a boolean array using index notation"""
    state["b1_is_list"] = type(state["b1"]) is list
    state["b1_0_is_boolean"] = type(state["b1"][0]) is bool

    state["b2"] = state["b1"] + [True]
    state["b1"].insert(0, False)

    state["b2_is_list"] = type(state["b2"]) is list
    state["b2_0_is_boolean"] = type(state["b2"][0]) is bool

def behavior(state, context):
    """Gets and sets a boolean value using index notation"""
    state["b1_is_boolean"] = type(state["b1"]) is bool

    state["b2"] = state["b1"] and True
    state["b1"] = False

    state["b2_is_boolean"] = type(state["b2"]) is bool

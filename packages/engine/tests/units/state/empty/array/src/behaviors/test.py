def behavior(state, context):
    """Verifies the type of the list"""
    state.l1_is_list = type(state.l1) is list
    state.l1_is_empty = len(state.l1) == 0

def behavior(state, context):
    """Verifies the type of the list"""
    state.l1_is_list = type(state.l1) is list

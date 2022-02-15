def behavior(state, context):
    """Verifies the type of the object"""
    state.o1_is_struct = type(state.o1) is dict

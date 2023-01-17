def behavior(state, context):
    """Ensure that context can't be altered from behaviors"""
    context.globals()["a"] = 5
    state.a = context.globals()["a"]

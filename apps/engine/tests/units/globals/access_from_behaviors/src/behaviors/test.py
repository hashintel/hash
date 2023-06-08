def behavior(state, context):
    """Access globals from behavior"""
    state.a = context.globals()["a"]

def behavior(state, context):
    """Accesses the neighbor's field `value`"""
    neighbor = context.neighbors()[0]
    state.value = neighbor["value"]

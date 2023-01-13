def behavior(state, context):
    """Sets `state.num_neighbors` to the number of neighbors found"""
    neighbors = context.neighbors()
    state.num_neighbors = len(neighbors)

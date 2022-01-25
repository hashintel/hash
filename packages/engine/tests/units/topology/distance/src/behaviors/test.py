def behavior(state, context):
    """Writes the number of neighbors into `state.num_neighbors`"""
    state.num_neighbors = len(context.neighbors())

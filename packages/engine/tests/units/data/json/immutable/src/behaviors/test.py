def behavior(state, context):
    """Ensures a dataset is immutable"""
    context.data()["dataset.json"]["number"] = 2
    state.number = context.data()["dataset.json"]["number"]

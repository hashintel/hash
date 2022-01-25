def behavior(state, context):
    """Ensures a dataset is immutable"""
    context.data()["dataset.csv"][0][0] = "4"
    state.column = context.data()["dataset.csv"][0]

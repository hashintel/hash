def init(context):
    """Try to modify globals in init"""
    context.globals()["a"] = 5

    return [{
        "behaviors": ["test.py"],
        "a": context.globals()["a"]
    }]

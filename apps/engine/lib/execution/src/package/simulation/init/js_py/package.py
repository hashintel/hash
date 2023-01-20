import json
import traceback


class UserCodeError(Exception):
    def __init__(self, short_msg, full_msg=""):
        self.short_msg = short_msg
        self.full_msg = full_msg


def _load_initializer(code):
    try:
        init_globals = dict()
        bytecode = compile(code, "init.py", "exec")
        exec(bytecode, init_globals)
        init_fn = init_globals.get("init")
    except Exception as e:
        # Have to catch generic `Exception` because user's code could throw anything.
        raise UserCodeError(
            short_msg=f"loading init file: {e}",
            full_msg=traceback.format_exc()
        )

    if not callable(init_fn):
        raise UserCodeError(short_msg="no function named 'init'")

    return init_fn


def run_task(_experiment, _sim, task_message, _group_state, context):
    if "Start" not in task_message:
        raise Exception("Unknown message type received, expected a Start")

    state_src = task_message["Start"]["initial_state_source"]
    init_fn = _load_initializer(code=state_src)

    try:
        agents = init_fn(context)
    except Exception as e:
        # User code can throw anything so we need to catch the broadest Exception
        raise UserCodeError(
            short_msg=f"running 'init' function: {e}",
            full_msg=traceback.format_exc(),
        )

    if not isinstance(agents, list):
        raise UserCodeError(short_msg="init function must return a list")

    try:
        data = json.dumps({"Success": {
            "agents": agents,
        }})
    except (TypeError, ValueError) as e:
        raise UserCodeError(
            short_msg=f"serializing init return value to JSON failed: {e}"
        )

    # TODO: Change the runner to avoid this, perhaps a function or a well-defined object would make this clearer.
    return {'task': data}

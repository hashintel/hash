import sys

# `behavior_descs` should be a list of objects that have fields `id`, `name`, `source`, `columns`,
# `language` and `dyn_access`.
def load_behaviors(behavior_descs):
    behaviors = {}
    warnings = [] # TODO: Accumulate warnings automatically with something like `hash_util.warn`
    for desc in behavior_descs:
        if desc.language != "py":
            behaviors[desc.id] = {
                "name": desc.name,
                "language": desc.language,
            }
            continue

        try:
            # behavior_globals should contain a callable `behavior` if the user's code is correct
            behavior_globals = {}
            bytecode = compile(desc.source.decode("utf-8"), desc.name, "exec")
            exec(bytecode, behavior_globals)
            behavior_fn = behavior_globals.get("behavior")

            if callable(behavior_fn):
                behaviors[desc.id] = {
                    "name": desc.name,
                    "language": desc.language,
                    "required_col_names": desc.columns,
                    "dyn_access": desc.dyn_access,
                    "fn": behavior_fn
                }
            else:
                warnings.append(
                    "Couldn't load behavior: No function named 'behavior': " + desc.name
                )

        except Exception as e:
            # Have to catch generic `Exception`, because user's code could throw anything.
            n_pkg_fns = 2
            tb = str(traceback.format_exception(type(exc), exc, tb)[n_pkg_fns:])
            warnings.append("Couldn't load behavior: {}: {}".format(desc.name, tb))

        # With the current implementation, failing to load a behavior
        # isn't an error if the behavior is never actually used. This
        # is consistent with Python usually not giving errors until an
        # erronous piece of code is actually run.
        # TODO: Discuss whether making it an error would help user's debugging.

    return behaviors, warnings

def start_experiment(experiment, init_message, experiment_context):
    experiment['behaviors'], warnings = load_behaviors(init_message.behavior_descs)
    return {
        "warnings": warnings
    }

def format_behavior_error(behavior_name, exc, tb):
    n_pkg_fns = 2
    full_msg = "Behavior error: " + str(traceback.format_exception(type(exc), exc, tb)[n_pkg_fns:])
    return full_msg

def postprocess(agent_state):
    msgs = agent_state.messages
    for m in msgs:
        # Types are checked here because flush might not happen until
        # several Python behaviors later (due to behavior chaining)
        # and if type becomes correct in the meantime, the error won't
        # be raised at all, so whether an error is raised would depend
        # on the rest of the behavior chain, not just the current behavior.

        if isinstance(m["to"], str):
            m["to"] = [m["to"]]
        elif type(m["to"]) != list:
            raise TypeError("Message `to` field must be list: " + str(m))

        if not isinstance(m["type"], str):
            raise TypeError("Message `type` field must be list: " + str(m))

    # TODO: `if agent_state._hasattr('position'):` unnecessary because built-in?
    position = agent_state.position
    if position is not None:
        while len(position) < 3:
            position.append(0.0)

    direction = agent_state.direction
    if direction is not None:
        while len(direction) < 3:
            direction.append(0.0)

def run_task(experiment, sim, _task_message, group_state, group_context):
    next_lang = None
    agent_state = None
    agent_context = None

    for i_agent in range(group_state.n_agents()):

        # Reuse `agent_state` object.
        agent_state = group_state.get_agent(i_agent, agent_state)

        behavior_ids = agent_state.__behaviors
        i_behavior = agent_state.__i_behavior # Need `i_behavior` outside loop scope.
        while i_behavior < len(behavior_ids):
            agent_state.__i_behavior = i_behavior

            behavior = experiment.behaviors[behavior_ids[i_behavior]]
            if behavior.language != "js":
                next_lang = behavior.language # Multiple assignments are fine.
                break

            group_state.set_dynamic_access(behavior.dyn_access)
            agent_context = group_context.get_agent(i_agent, agent_context)

            try:
                behavior.fn(agent_state, agent_context)
                postprocess(agent_state)

            except Exception as e:
                # Have to catch generic `Exception`, because user's code could throw anything.

                error = format_behavior_error(behavior.name, e, sys.exc_info())
                agent_state.__i_behavior = i_behavior
                return {
                    "target": "main",
                    "errors": [error]
                }

            i_behavior += 1

        agent_state.__i_behavior = i_behavior

    return {
        "target": next_lang if next_lang is not None else "main"
    }

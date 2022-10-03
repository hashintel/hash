import logging
from pathlib import Path
import sys
import traceback

import hash_util


def get_pkg_path(pkg_name, pkg_type):
    # The engine should be started from the engine's root directory in the repo.
    return Path(f"./lib/execution/src/package/simulation/{pkg_type}/{pkg_name}/package.py")


def load_fns(pkg_name, pkg_type):
    # Read code.
    path = get_pkg_path(pkg_name, pkg_type)

    try:
        code = path.read_text(encoding="utf8")
    except IOError:
        logging.info("`%s` doesn't exist, possibly intentionally", path)
        return [None, None, None]

    # Run code.
    pkg_globals = {"hash_util": hash_util}
    try:
        bytecode = compile(code, pkg_name, "exec")
        # pylint: disable=exec-used
        exec(bytecode, pkg_globals)
    except Exception:
        # Have to catch generic Exception, because package could throw anything
        error = str(traceback.format_exception(*sys.exc_info()))
        raise RuntimeError from f"Couldn't import package {path}: {error}"

    # Extract functions.
    fn_names = ["start_experiment", "start_sim", "run_task"]
    fns = [pkg_globals.get(name) for name in fn_names]

    # Validate functions.
    for (fn_name, fn) in zip(fn_names, fns):
        if fn is not None and not callable(fn):
            raise Exception(
                f"Couldn't import package {pkg_name}: {fn_name} should be callable, not {type(fn)}"
            )
    return fns


class Package:
    def __init__(self, name, pkg_type, owned_fields):
        self.name = name
        self.type = pkg_type
        self.owns_field = set(owned_fields)

        fns = load_fns(name, pkg_type)  # Elements can be `None`.
        self.start_experiment = fns[0]
        self.start_sim = fns[1]
        self.run_task = fns[2]

        # `experiment` argument to package functions, initialized as empty dict.
        self.experiment = {}

        # `sim` arguments to sim-level (start_sim, run_task) package functions,
        # initialized as empty dicts.
        self.sims = {}

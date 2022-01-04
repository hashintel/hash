from pathlib import Path


def get_pkg_path(pkg_name, pkg_type):
    return Path("../../../simulation/package/{}/packages/{}/package.py".format(
        pkg_type, pkg_name
    ))


def load_fns(pkg_name, pkg_type):
    # Read code.
    path = get_pkg_path(pkg_name, pkg_type)
    code = "import ........worker.runner.python.hash_util\n"+path.read_text()

    # Run code.
    pkg_globals = {}
    bytecode = compile(code.decode("utf-8"), pkg_name, "exec")
    exec(bytecode, pkg_globals)

    # Extract functions.
    fn_names = ["start_experiment", "start_sim", "run_task"]
    fns = [(name, pkg_globals.get(name)) for name in fn_names]

    # Validate functions.
    for (fn_name, fn) in fns:
        if fn is not None and not callable(fn):
            raise Exception(
                "Couldn't import package {}: {} should be callable, not {}".format(
                    pkg_name, fn_name, type(fn)
                )
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

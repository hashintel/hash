from context import SimContext
from state import SimState


# Each package should have properties `name`, `loaders`, `getters` and `owns_field`.
def gather_custom_fns(pkgs, custom_property):
    ret = {}
    for pkg in pkgs:
        for field_name in pkg[custom_property]:
            if not pkg.owns_field[field_name]:
                raise RuntimeError(
                    "Packages can only specify " + custom_property + " for fields they own, not '" +
                    field_name + "' in " + pkg.name
                )

            if ret.get(field_name) is not None:
                raise RuntimeError(
                    "Duplicate '" + field_name + "' in " + pkg.name + " " + custom_property
                )

            ret[field_name] = pkg[custom_property][field_name]

    return ret


class Sim:
    def __init__(self, schema, experiment_ctx, sim_globals):
        self.schema = schema

        # Context loaders and getters are for columns in the context batch.
        sim.context_loaders = {}
        sim.context_getters = {}

        # State loaders and getters are for columns in the state agent batch.
        sim.state_loaders = {}
        sim.state_getters = {}

        self.ctx = SimContext(sim.context_getters, experiment_ctx, sim_globals)
        self.state = SimState(sim.state_getters)

    def maybe_add_custom_fns(self, to_add, custom_property, pkg):
        to_add = to_add.get(custom_property)
        if to_add is None:
            return

        custom_fns = self.__getattr__(pkg.type + '_' + custom_property)
        for field_name in to_add:
            if not pkg.owns_field.get(field_name):
                raise RuntimeError(
                    "Packages can only specify " + custom_property + " for fields they own, not '" +
                    field_name + "' in " + pkg.name
                )

            if field_name in custom_fns:
                raise RuntimeError(
                    "Duplicate '" + field_name + "' in " + pkg.name + " " + custom_property
                )

            custom_fns[field_name] = to_add[field_name]

from context import SimContext
from state import SimState


class Sim:
    def __init__(self, schema, experiment_ctx, sim_globals):
        self.schema = schema
        self.globals = sim_globals

        # Context loaders and getters are for columns in the context batch.
        self.context_loaders = {}
        self.context_getters = {}

        # State loaders and getters are for columns in the state agent batch.
        self.state_loaders = {}
        self.state_getters = {}

        self.context = SimContext(self.context_getters, experiment_ctx, sim_globals)
        self.state = SimState(self.state_getters)

    # `pkg` should have properties `name`, `loaders`, `getters` and `owns_field`.
    def maybe_add_custom_fns(self, to_add, custom_property, pkg):
        to_add = to_add.get(custom_property)
        if to_add is None:
            return

        custom_fns = getattr(self, pkg.type + "_" + custom_property)
        for field_name in to_add:
            # TODO: Uncomment after propagating owned_fields:
            # if not pkg.owns_field.get(field_name):
            #     raise RuntimeError(
            #         f"Packages can only specify {custom_property} for fields they own, "
            #         f"not '{field_name}' in {pkg.name}"
            #     )

            if field_name in custom_fns:
                raise RuntimeError(
                    f"Duplicate '{field_name}' in {pkg.name}  {custom_property}"
                )

            custom_fns[field_name] = to_add[field_name]

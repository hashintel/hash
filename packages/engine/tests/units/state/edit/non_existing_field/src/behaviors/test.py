#
# Reading non-existing field `non_existing_field`
#
def behavior(state, context):
  state.set("field_to_be_set", state.get("non_existing_field"))

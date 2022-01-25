/**
 * Reading non-existing field `non_existing_field`
 */
const behavior = (state, context) => {
  state.set("field_to_be_set", state.get("non_existing_field"));
};

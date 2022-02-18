/**
 * Reads messages and stores them into the agent's state
 */
const behavior = (state, context) => {
  const messages = context.messages();

  if (messages.length > 0) {
    const data = messages[0].data;

    state.struct = {
      number: data.struct.number,
      string: data.struct.string,
      bool: data.struct.bool,
      struct: data.struct.struct,
      number_array: data.struct.number_array,
      bool_array: data.struct.bool_array,
      struct_array: data.struct.struct_array,
      fixed_number_array: data.struct.fixed_number_array,
      fixed_bool_array: data.struct.fixed_bool_array,
      fixed_struct_array: data.struct.fixed_struct_array,
    };
  }
};

/**
 * Sends a message "test" with all possible data types to "1"
 */
const behavior = (state, context) => {
  state.messages = [
    {
      to: "1",
      type: "test",
      data: {
        number: 1,
        string: "test",
        bool: true,
        struct: {
          a: 2,
        },
        number_array: [1, 2, 3],
        bool_array: [true, false, true],
        struct_array: [
          {
            b: 3,
          },
          {
            c: "test",
          },
        ],
      },
    },
  ];
};

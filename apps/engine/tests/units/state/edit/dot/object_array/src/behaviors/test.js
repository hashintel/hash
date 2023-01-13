/**
 * Gets and sets a struct array using dot notation
 */
const behavior = (state, context) => {
  state.o1_is_list = Array.isArray(state.o1);
  state.o1_0_is_struct =
    typeof state.o1[0] === "object" && !Array.isArray(state.o1[0]);
  state.o1_0_n1_is_number = typeof state.o1[0].n1 === "number";

  state.o1[0].n2 = state.o1[0].n1 + 1;
  state.o1.push({ n3: 3 });

  state.o1_0_n2_is_number = typeof state.o1[0].n2 === "number";
  state.o1_1_is_struct =
    typeof state.o1[1] === "object" && !Array.isArray(state.o1[1]);
  state.o1_1_n3_is_number = typeof state.o1[1].n3 === "number";
};

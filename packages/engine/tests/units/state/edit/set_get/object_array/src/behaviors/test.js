/**
 * Gets and sets a struct array using set/get notation
 */
const behavior = (state, context) => {
  state.set("o1_is_list", Array.isArray(state.get("o1")));
  state.set(
    "o1_0_is_struct",
    typeof state.get("o1")[0] === "object" &&
      !Array.isArray(state.get("o1")[0]),
  );
  state.set("o1_0_n1_is_number", typeof state.get("o1")[0].n1 === "number");

  const o1 = state.get("o1");

  o1[0].n2 = o1[0].n1 + 1;
  o1.push({ n3: 3 });

  state.set("o1", o1);

  state.set("o1_0_n2_is_number", typeof state.get("o1")[0].n2 === "number");
  state.set(
    "o1_1_is_struct",
    typeof state.get("o1")[1] === "object" &&
      !Array.isArray(state.get("o1")[0]),
  );
  state.set("o1_1_n3_is_number", typeof state.get("o1")[1].n3 === "number");
};

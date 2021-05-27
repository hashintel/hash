const { prop } = require("../prop");

describe("lib/prop", () => {
  test("prop on undefined returns undefined", () => {
    const expected = undefined;
    const actual = prop(["a"], undefined);
    expect(actual).toBe(expected);
  });

  test("prop on null returns undefined", () => {
    const expected = undefined;
    const actual = prop(["a"], null);
    expect(actual).toBe(expected);
  });

  test("prop[] returns object", () => {
    const expected = {};
    const actual = prop([], expected);
    expect(actual).toBe(expected);
  });

  test("prop[a] returns object[a]", () => {
    const expected = "SUCCESS";
    const actual = prop(["a"], { a: expected });
    expect(actual).toBe(expected);
  });

  test("prop missing prop returns undefined", () => {
    const expected = undefined;
    const actual = prop(["a", "b"], { a: 123 });
    expect(actual).toBe(expected);
  });

  test("prop nested returns value", () => {
    const expected = "SUCCESS";
    const actual = prop(["a", "b"], { a: { b: expected } });
    expect(actual).toBe(expected);
  });
});

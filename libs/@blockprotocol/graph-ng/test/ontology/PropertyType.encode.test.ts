import { describe, test } from "vitest";

describe("DataType", () => {
  test.todo("standard", () => {});
  test.todo("not actual DataType", () => {});
});

describe("PropertyObject", () => {
  test.todo("nested PropertyType", () => {});
  test.todo("array of PropertyTypes", () => {});
  test.todo("multiple keys - nested PropertyTypes", () => {});
  test.todo("multiple keys - array of PropertyTypes", () => {});
  test.todo("multiple keys - mixed", () => {});

  test.todo("incorrect keys", () => {});
  test.todo("value is not nested or array of nested", () => {});
});

describe("ArrayOfPropertyValues", () => {
  test.todo("DataType", () => {});
  test.todo("PropertyObject", () => {});
  test.todo("ArrayOfPropertyValues", () => {});

  test.todo("multiple oneOf", () => {});

  test.todo("inner not PropertyValues", () => {});
});

describe("oneOf: PropertyValues", () => {
  test.todo("DataType + PropertyObject", () => {});
  test.todo("DataType + ArrayOfPropertyValues", () => {});
  test.todo("PropertyObject + ArrayOfPropertyValues", () => {});
  test.todo("DataType + PropertyObject + ArrayOfPropertyValues", () => {});
  test.todo("DataType + PropertyObject + DataType + PropertyObject", () => {});
  test.todo(
    "DataType + PropertyObject + DataType + ArrayOfPropertyValues",
    () => {},
  );

  test.todo(
    "inner not DataType/PropertyObject/ArrayOfPropertyValues",
    () => {},
  );

  test.todo("refinement applied to union", () => {});
  test.todo("transformation applied to union", () => {});
  test.todo("suspense applied to union", () => {});
  test.todo(
    "refinement + transformation + suspense applied to union",
    () => {},
  );
});

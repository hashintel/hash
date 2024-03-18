import { describe, test } from "vitest";

describe("DataType", () => {
  test("standard", () => {});
  test("not actual DataType", () => {});
});

describe("PropertyObject", () => {
  test("nested PropertyType", () => {});
  test("array of PropertyTypes", () => {});
  test("multiple keys - nested PropertyTypes", () => {});
  test("multiple keys - array of PropertyTypes", () => {});
  test("multiple keys - mixed", () => {});

  test("incorrect keys", () => {});
  test("value is not nested or array of nested", () => {});
});

describe("ArrayOfPropertyValues", () => {
  test("DataType", () => {});
  test("PropertyObject", () => {});
  test("ArrayOfPropertyValues", () => {});

  test("multiple oneOf", () => {});

  test("inner not PropertyValues", () => {});
});

describe("oneOf: PropertyValues", () => {
  test("DataType + PropertyObject", () => {});
  test("DataType + ArrayOfPropertyValues", () => {});
  test("PropertyObject + ArrayOfPropertyValues", () => {});
  test("DataType + PropertyObject + ArrayOfPropertyValues", () => {});
  test("DataType + PropertyObject + DataType + PropertyObject", () => {});
  test("DataType + PropertyObject + DataType + ArrayOfPropertyValues", () => {});

  test("inner not DataType/PropertyObject/ArrayOfPropertyValues", () => {});
});

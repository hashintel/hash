import { describe, expect, it } from "vitest";

import { dedentLines, toBodyForm } from "./code-bodies";

describe("toBodyForm", () => {
  it("keeps a bare body as it is", () => {
    expect(toBodyForm("return parameters.rate;", "rate")).toBe(
      "return parameters.rate;",
    );
  });

  it("unwraps a module with an expression body into a return", () => {
    expect(
      toBodyForm(
        "export default Lambda((input, parameters) => parameters.arrival_rate)",
        "rate",
      ),
    ).toBe("return parameters.arrival_rate;");
  });

  it("unwraps a module with a block body, keeping its comments", () => {
    expect(
      toBodyForm(
        `// Add one customer.
export default TransitionKernel(() => {
  return {
    Waiting: [{}],
  };
});`,
        "kernel",
      ),
    ).toBe(`// Add one customer.
return {
  Waiting: [{}],
};`);
  });

  it("unwraps a parameter the body never reads, whatever it is called", () => {
    expect(
      toBodyForm(
        "export default Lambda((tokens, parameters) => parameters.rate)",
        "rate",
      ),
    ).toBe("return parameters.rate;");
  });

  it("keeps a module whose renamed parameter the body reads", () => {
    const code = "export default Lambda((t, parameters) => t.Space.length)";
    expect(toBodyForm(code, "rate")).toBe(code);
  });

  it("keeps a visualizer module, which has no body form", () => {
    const code = "export default Visualization(({ tokens }) => <svg />);";
    expect(toBodyForm(code, "visualizer")).toBe(code);
  });
});

describe("dedentLines", () => {
  it("drops blank edges and the common indentation", () => {
    expect(dedentLines("\n    const a = 1;\n      return a;\n\n")).toEqual([
      "const a = 1;",
      "  return a;",
    ]);
  });
});

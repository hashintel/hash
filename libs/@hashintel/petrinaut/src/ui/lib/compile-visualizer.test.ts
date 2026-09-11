import { describe, expect, it } from "vitest";

import { compileVisualizer } from "./compile-visualizer";

const compileError = (code: string): unknown => {
  try {
    compileVisualizer(code);
    return null;
  } catch (error) {
    return error;
  }
};

const emptyProps = { tokens: [], parameters: {} };

describe("compileVisualizer", () => {
  it("compiles and renders a plain visualizer", () => {
    const component = compileVisualizer(`
      export default Visualization(({ tokens }) => {
        return <div>{tokens.length}</div>;
      });
    `);
    const element = component(emptyProps);
    expect(element.type).toBe("div");
  });

  it("shadows browser globals for the component body", () => {
    const component = compileVisualizer(`
      export default Visualization(() => {
        return <div>{String(typeof window)}-{String(typeof fetch)}-{String(typeof globalThis)}</div>;
      });
    `);
    const element = component(emptyProps) as unknown as {
      props: { children: string[] };
    };
    expect(element.props.children.join("")).toBe(
      "undefined-undefined-undefined",
    );
  });

  it("shadows browser globals for module-level code", () => {
    expect(() =>
      compileVisualizer(`
        const stolen = fetch("https://example.com");
        export default Visualization(() => <div />);
      `),
    ).toThrow(/fetch is not a function|Failed to compile/);
  });

  it("blocks the constructor-chain escape during render", () => {
    const component = compileVisualizer(`
      export default Visualization(() => {
        const FunctionCtor = ({}).constructor.constructor;
        return <div>{String(typeof FunctionCtor)}</div>;
      });
    `);
    // `.constructor` is masked to undefined during the sandboxed call, so
    // the second step of the walk throws.
    expect(() => component(emptyProps)).toThrow(TypeError);
  });

  it("blocks the constructor-chain escape at module level", () => {
    expect(() =>
      compileVisualizer(`
        const FunctionCtor = ({}).constructor.constructor;
        const leak = FunctionCtor("return globalThis")();
        export default Visualization(() => <div />);
      `),
    ).toThrow(/Failed to compile/);
  });

  it("runs the module body in strict mode", () => {
    // Assigning to an undeclared identifier creates a global in sloppy mode
    // and throws a ReferenceError in strict mode.
    expect(() =>
      compileVisualizer(`
        undeclaredLeak = 1;
        export default Visualization(() => <div />);
      `),
    ).toThrow(/Failed to compile/);
  });
});

describe("compileVisualizer caching", () => {
  it("returns the component already made for the same code", () => {
    const code = `export default Visualization(() => <div />);`;

    expect(compileVisualizer(code)).toBe(compileVisualizer(code));
  });

  it("compiles code that differs", () => {
    const first = compileVisualizer(
      `export default Visualization(() => <span />);`,
    );
    const second = compileVisualizer(
      `export default Visualization(() => <section />);`,
    );

    expect(first).not.toBe(second);
  });

  it("keeps a failure rather than recompiling it", () => {
    const broken = `export default Visualization(() => <div />; // unbalanced`;

    const first = compileError(broken);
    const second = compileError(broken);

    expect(first).toBeInstanceOf(Error);
    expect(second).toBe(first);
  });

  it("evicts the visualizer used least recently, not the one made first", () => {
    const kept = `export default Visualization(() => <p>kept</p>);`;
    const dropped = `export default Visualization(() => <p>dropped</p>);`;
    const first = compileVisualizer(kept);
    compileVisualizer(dropped);

    // A keystroke's worth of drafts, with the kept one looked at halfway.
    for (let draft = 0; draft < 30; draft++) {
      if (draft === 15) {
        compileVisualizer(kept);
      }
      compileVisualizer(`export default Visualization(() => <i>${draft}</i>);`);
    }

    expect(compileVisualizer(kept)).toBe(first);
    expect(compileVisualizer(dropped)).not.toBe(compileVisualizer(kept));
  });
});

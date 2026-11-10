import { describe, expect, it } from "vitest";

import { lowerTypeScriptToHir } from "../hir/lower-typescript";
import { migrateWholePlaceDynamicsCode } from "./whole-place-code";

const launcherCode = `// Example of ODE for Satellite in orbit (simplified)
const mu = parameters.gravitational_constant; // Gravitational parameter

// Process each token (satellite)
return tokens.map(({ x, y, direction, velocity }) => {
  const r = Math.hypot(x, y); // Distance to planet center

  // Gravitational acceleration vector (points toward origin)
  const ax = (-mu * x) / (r * r * r);
  const ay = (-mu * y) / (r * r * r);

  // Return derivatives for this token
  return {
    x: velocity * Math.cos(direction),
    y: velocity * Math.sin(direction),
    direction:
      (-ax * Math.sin(direction) + ay * Math.cos(direction)) / velocity,
    velocity:
      ax * Math.cos(direction) + ay * Math.sin(direction),
  }
})`;

const launcherMigrated = `// Example of ODE for Satellite in orbit (simplified)
const mu = parameters.gravitational_constant; // Gravitational parameter

// Process each token (satellite)
const [token] = tokens;
const { x, y, direction, velocity } = token;
const r = Math.hypot(x, y); // Distance to planet center

// Gravitational acceleration vector (points toward origin)
const ax = (-mu * x) / (r * r * r);
const ay = (-mu * y) / (r * r * r);

// Return derivatives for this token
return {
  x: velocity * Math.cos(direction),
  y: velocity * Math.sin(direction),
  direction:
    (-ax * Math.sin(direction) + ay * Math.cos(direction)) / velocity,
  velocity:
    ax * Math.cos(direction) + ay * Math.sin(direction),
}`;

const lowersAsOneTokenBody = (code: string): boolean =>
  lowerTypeScriptToHir(code, "dynamics", { arity: 1 }).ok;

describe("migrateWholePlaceDynamicsCode", () => {
  it("lifts a block callback with a destructured token after the preceding statements", () => {
    expect(migrateWholePlaceDynamicsCode(launcherCode)).toBe(launcherMigrated);
    expect(lowersAsOneTokenBody(launcherMigrated)).toBe(true);
  });

  it("returns a parenthesized object literal directly", () => {
    const code = `// Every waiting order ages at a constant rate.
return tokens.map(() => ({
  age: 1,
  priority: 0,
}));`;
    const migrated = `// Every waiting order ages at a constant rate.
return {
  age: 1,
  priority: 0,
};`;
    expect(migrateWholePlaceDynamicsCode(code)).toBe(migrated);
    expect(lowersAsOneTokenBody(migrated)).toBe(true);
  });

  it("binds a named token parameter by its own name", () => {
    expect(
      migrateWholePlaceDynamicsCode(
        "return tokens.map((satellite) => ({ x: satellite.vx }));",
      ),
    ).toBe("const [satellite] = tokens;\nreturn { x: satellite.vx };");
  });

  it("picks a token name the code does not use yet", () => {
    const code = `const token = parameters.scale;
return tokens.map(({ x }) => ({ x: token * x }));`;
    expect(migrateWholePlaceDynamicsCode(code)).toBe(
      `const token = parameters.scale;
const [token_] = tokens;
const { x } = token_;
return { x: token * x };`,
    );
  });

  it("unwraps the module form when its parameters carry the ambient names", () => {
    const code = `export default Dynamics((tokens, parameters) => {
  const k = parameters.k;
  return tokens.map((t) => ({ x: -k * t.x }));
});`;
    expect(migrateWholePlaceDynamicsCode(code)).toBe(
      `const k = parameters.k;
const [t] = tokens;
return { x: -k * t.x };`,
    );
    expect(
      migrateWholePlaceDynamicsCode(
        "export default Dynamics((tokens) => tokens.map((t) => ({ x: t.x })));",
      ),
    ).toBe("const [t] = tokens;\nreturn { x: t.x };");
  });

  it("keeps the comment above a module's export and brackets inside literals", () => {
    const code = `// Example of ODE for Satellite in orbit (simplified)
export default Dynamics((tokens, parameters) => {
  const label = "map(" + ")"; // a ")" in a string and a comment
  return tokens.map(({ x }) => {
    const note = \`{ \${x} }\`;
    return { x: note.length };
  });
});`;
    expect(migrateWholePlaceDynamicsCode(code)).toBe(
      `// Example of ODE for Satellite in orbit (simplified)
const label = "map(" + ")"; // a ")" in a string and a comment
const [token] = tokens;
const { x } = token;
const note = \`{ \${x} }\`;
return { x: note.length };`,
    );
  });

  it("keeps a destructuring default on the token binding", () => {
    expect(
      migrateWholePlaceDynamicsCode(
        "return tokens.map(({ x = 0 }) => ({ x }));",
      ),
    ).toBe("const [token] = tokens;\nconst { x = 0 } = token;\nreturn { x };");
  });

  it("leaves out destructured fields the callback never reads", () => {
    const code = `return tokens.map(({ processing_left, quality, source_mix, cost }) => ({
  processing_left: processing_left > 0 ? -1 : 0,
  quality: quality > 0 ? -1 : 0,
  source_mix: 0,
  cost: 0,
}));`;
    expect(migrateWholePlaceDynamicsCode(code)).toBe(
      `const [token] = tokens;
const { processing_left, quality } = token;
return {
  processing_left: processing_left > 0 ? -1 : 0,
  quality: quality > 0 ? -1 : 0,
  source_mix: 0,
  cost: 0,
};`,
    );
  });

  it("binds nothing when the callback reads no field", () => {
    expect(
      migrateWholePlaceDynamicsCode(
        `return tokens.map(({ machine_damage_ratio }) => {
  return {
    machine_damage_ratio: -parameters.damage_reparation_per_second
  };
});`,
      ),
    ).toBe(`return {
  machine_damage_ratio: -parameters.damage_reparation_per_second
};`);
    expect(
      migrateWholePlaceDynamicsCode("return tokens.map((t) => ({ age: 1 }));"),
    ).toBe("return { age: 1 };");
  });

  it("keeps a renamed field that is read and a nested pattern", () => {
    expect(
      migrateWholePlaceDynamicsCode(
        "return tokens.map(({ x: px, y: py, z }) => ({ x: px + py }));",
      ),
    ).toBe(
      "const [token] = tokens;\nconst { x: px, y: py } = token;\nreturn { x: px + py };",
    );
    expect(
      migrateWholePlaceDynamicsCode(
        "return tokens.map(({ a: { b } }) => ({ x: b }));",
      ),
    ).toBe(
      "const [token] = tokens;\nconst { a: { b } } = token;\nreturn { x: b };",
    );
  });

  it("carries a trailing comment and semicolon", () => {
    expect(
      migrateWholePlaceDynamicsCode(
        "return tokens.map((t) => ({ x: t.x })); // per token",
      ),
    ).toBe("const [t] = tokens;\nreturn { x: t.x };\n// per token");
  });

  it.each([
    [
      "a callback that reads the index",
      "return tokens.map((t, i) => ({ x: i }));",
    ],
    [
      "another read of tokens",
      "const n = tokens.length;\nreturn tokens.map((t) => ({ x: n }));",
    ],
    [
      "an early return",
      "if (parameters.frozen) return [];\nreturn tokens.map((t) => ({ x: 1 }));",
    ],
    ["a different method", "return tokens.filter((t) => t.x > 0);"],
    ["a one-token body", "const [token] = tokens;\nreturn { x: token.x };"],
    [
      "a module form with other parameter names",
      "export default Dynamics((items) => items.map((t) => ({ x: t.x })));",
    ],
    [
      "a second argument to map",
      "return tokens.map((t) => ({ x: t.x }), this);",
    ],
    [
      "a function expression",
      "return tokens.map(function (t) { return { x: t.x }; });",
    ],
    ["an unbalanced body", "return tokens.map((t) => ({ x: );"],
    [
      "a callback local declared before the return too",
      "const k = parameters.k;\nreturn tokens.map(({ x }) => {\n  const k = 2;\n  return { x: -k * x };\n});",
    ],
    [
      "a token field named like a local before the return",
      "const x = parameters.x;\nreturn tokens.map(({ x }) => ({ x: -x }));",
    ],
    [
      "code after a long run of spaces",
      `return tokens.map((t) => ({ x: t.x }))${" ".repeat(60_000)}x`,
    ],
  ])("leaves %s alone", (_label, code) => {
    expect(migrateWholePlaceDynamicsCode(code)).toBeNull();
  });

  it("lifts a callback whose local shares its name with a property read before the return", () => {
    expect(
      migrateWholePlaceDynamicsCode(
        "const rate = parameters.k;\nreturn tokens.map(({ x }) => {\n  const k = rate * 2;\n  return { x: -k * x };\n});",
      ),
    ).toBe(
      "const rate = parameters.k;\nconst [token] = tokens;\nconst { x } = token;\nconst k = rate * 2;\nreturn { x: -k * x };",
    );
  });

  it("binds a token that is only spread", () => {
    expect(
      migrateWholePlaceDynamicsCode(
        "return tokens.map((t) => ({ ...t, x: 1 }));",
      ),
    ).toBe("const [t] = tokens;\nreturn { ...t, x: 1 };");
  });
});

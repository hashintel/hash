import { expect, test } from "vitest";

import { resolveDefaultAssistant } from "./default-assistant";

test("defaults to Petrinaut AI, accepts Brunch, and reads stock as Petrinaut AI", () => {
  expect(resolveDefaultAssistant(undefined)).toBe("petrinaut-ai");
  expect(resolveDefaultAssistant(" ")).toBe("petrinaut-ai");
  expect(resolveDefaultAssistant("petrinaut-ai")).toBe("petrinaut-ai");
  expect(resolveDefaultAssistant("stock")).toBe("petrinaut-ai");
  expect(resolveDefaultAssistant("brunch")).toBe("brunch");
  expect(() => resolveDefaultAssistant("other")).toThrow(
    /VITE_PETRINAUT_DEFAULT_ASSISTANT/u,
  );
});

// jsdom doesn't implement the CSS namespace. Assigned rather than stubbed so
// tests calling `vi.unstubAllGlobals()` don't remove it.
if (typeof CSS === "undefined") {
  Object.assign(globalThis, {
    CSS: { escape: (value: string) => value.replace(/[^\w-]/g, "\\$&") },
  });
}

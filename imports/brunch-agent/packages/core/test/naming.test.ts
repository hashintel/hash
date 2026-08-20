import { describe, expect, test } from 'bun:test';
import { OPERATIONS, PRODUCT_NAME, toolName, toolPrefix } from '../src/naming.ts';

// Spec §12.3: architectural strings name identity, not function. The tool
// prefix derives from the product name so the unresolved name-fog costs one
// edit, not a repo-wide rename.
describe('tool namespacing', () => {
  test('the prefix derives from the product name', () => {
    expect(toolPrefix('Loom')).toBe('loom_');
    expect(toolPrefix('bl')).toBe('bl_');
  });

  test('the prefix normalizes punctuation and spacing out of a product name', () => {
    expect(toolPrefix('Well-Spoken 2')).toBe('wellspoken2_');
  });

  test('a product name with no usable characters is refused, not silently emptied', () => {
    expect(() => toolPrefix('  -- ')).toThrow(/product name/i);
    expect(() => toolPrefix('')).toThrow(/product name/i);
  });

  test('a product name that starts with a digit is refused', () => {
    // Tool names have to read as identifiers to the model and the substrate.
    expect(() => toolPrefix('2fast')).toThrow(/product name/i);
  });

  test('tool names are the prefix applied to an abstract operation name', () => {
    expect(toolName('ask', 'Loom')).toBe('loom_ask');
  });

  test('tool names default to the current product name', () => {
    expect(toolName('ask')).toBe(`${toolPrefix(PRODUCT_NAME)}ask`);
  });

  test('an operation name that is not an identifier is refused', () => {
    expect(() => toolName('ask user!', 'Loom')).toThrow(/operation/i);
    expect(() => toolName('', 'Loom')).toThrow(/operation/i);
  });
});

describe('the settled product name', () => {
  test('names identity, never function', () => {
    // Spec §12.3's surviving rule. The ban on `brunch` lapsed when the name
    // settled (ADR-0001); the ban on naming what a tool *does* did not, and it
    // is the half that was load-bearing — `elicit_*` would fix the product's
    // purpose in every model-facing string it owns.
    const prefix = toolPrefix(PRODUCT_NAME);
    expect(prefix).not.toContain('elicit');
    for (const operation of OPERATIONS) {
      expect(toolName(operation)).not.toContain('elicit');
    }
  });

  test('every model-facing tool carries the product prefix', () => {
    // Flue requires globally unique tool names per render and reserves some of
    // its own; the prefix is what keeps this product's tools from colliding
    // with a co-mounted library's.
    for (const operation of OPERATIONS) {
      expect(toolName(operation)).toStartWith(toolPrefix(PRODUCT_NAME));
    }
  });

  test('every declared operation renders a distinct, well-formed tool name', () => {
    const names = OPERATIONS.map((operation) => toolName(operation));
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9]*_[a-z][a-z0-9_]*$/);
  });
});

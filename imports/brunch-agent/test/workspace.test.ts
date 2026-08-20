/**
 * The introspection helpers themselves, at the seams where a wrong answer
 * makes some other invariant pass vacuously or fail spuriously.
 *
 * Agent-module detection is the load-bearing one: the FE-1361 review found the
 * old bare substring match turned any file whose *comments* mention the
 * `'use agent'` directive into an "agent module", failing two assertions on a
 * comment-only change. Detection is now anchored to a directive *statement* —
 * and deliberately not to the first statement only, so a misplaced directive
 * is still detected and then failed by the first-statement invariant instead
 * of escaping it.
 */

import { describe, expect, test } from 'bun:test';
import { isAgentModule, type SourceFile } from './workspace.ts';

const file = (text: string): SourceFile => ({
  path: '/fake/module.ts',
  relPath: 'fake/module.ts',
  text,
});

describe('isAgentModule', () => {
  test('a module whose first statement is the directive is one', () => {
    expect(isAgentModule(file("'use agent';\nexport function A() {}\n"))).toBe(true);
    expect(isAgentModule(file('"use agent";\nexport function A() {}\n'))).toBe(true);
  });

  test('a leading doc block before the directive still counts', () => {
    expect(isAgentModule(file("/** The agent. */\n'use agent';\nexport {};\n"))).toBe(true);
  });

  test('a comment mentioning the directive is not a directive', () => {
    // The regression the FE-1361 review verified: CI went red on a
    // comment-only change because detection matched raw file text.
    expect(isAgentModule(file("// the 'use agent' directive must come first\nexport {};\n"))).toBe(
      false,
    );
    expect(
      isAgentModule(file('/**\n * A file about the "use agent" directive.\n */\nexport {};\n')),
    ).toBe(false);
  });

  test('a trailing comment on the directive line does not hide the module', () => {
    // `'use agent'; // registers X` is still a directive at runtime — comments
    // are not statements — so it must still be detected, or every downstream
    // invariant passes vacuously for that module.
    expect(isAgentModule(file("'use agent'; // registers the elicitor\nexport {};\n"))).toBe(true);
    expect(isAgentModule(file("'use agent'; /* registered */\nexport {};\n"))).toBe(true);
  });

  test('a misplaced directive is still detected, so the first-statement invariant can fail it', () => {
    // If detection required the directive to be first, a module that misplaced
    // it would silently stop being checked at all — the exact silent pass the
    // first-statement test exists to prevent.
    expect(isAgentModule(file("import 'x';\n'use agent';\nexport {};\n"))).toBe(true);
  });

  test('quotes must match', () => {
    expect(isAgentModule(file('\'use agent";\nexport {};\n'))).toBe(false);
  });
});

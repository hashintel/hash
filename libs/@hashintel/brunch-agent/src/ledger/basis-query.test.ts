import * as v from "valibot";
import { expect, test } from "vitest";

import {
  basisQueryReasons,
  queryBasisToolDescription,
  vBasisQueryInput,
} from "./basis-query";

test("the basis query's description and reasons are pinned", () => {
  expect(queryBasisToolDescription).toMatchInlineSnapshot(
    `"Use when the USER asks why a visible net element exists or is modelled as it is, instead of answering from memory. Finds the element in the latest net read, or in the net read back after a later change, and returns its recorded basis: the reflections that name the element and, behind them, the claims, entities and discharged obligations they rest on, each with its ID, and the conversation turns those records came from, each with its ID and the opening of the USER's words. Answer from that basis and cite its record IDs. Cite every returned turn too, by quoting the opening of the USER's words, never by its ID, so the USER can see what they said that the answer rests on. A claim under \`superseded\` was later replaced: say so, and give its replacement. It also lists the canonical calls that changed the element, with their document and Ledger revisions. A basis-absent disposition means no reflection names the element: say plainly that its basis was not recorded rather than reconstructing one. You may point to related records, but do not offer a rationale of your own for it. A stale-read disposition means the net changed after the latest net view, a read or a change's read-back, without a later read-back: read it again, then query."`,
  );
  expect(basisQueryReasons).toMatchInlineSnapshot(`
    {
      "basis-absent": "No reflection names this element, so its basis was not recorded.",
      "basis-declared": "Reflections name this element; the basis is what they rest on.",
      "not-found": "The named element is absent or ambiguous in the latest net view.",
      "stale-read": "The net changed after the latest net view without a subsequent read-back; read it again, then query.",
    }
  `);
});

test("the basis query takes one element by its selector", () => {
  expect(
    v.parse(vBasisQueryInput, { selector: { kind: "place", name: "Queue" } }),
  ).toEqual({ selector: { kind: "place", name: "Queue" } });
  expect(() =>
    v.parse(vBasisQueryInput, { selector: { kind: "nothing" } }),
  ).toThrow(/Invalid/u);
});

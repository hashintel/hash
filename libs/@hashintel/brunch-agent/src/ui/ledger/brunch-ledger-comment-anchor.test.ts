/** @vitest-environment jsdom */
import { afterEach, expect, test } from "vitest";

import { selectedLedgerAddresses } from "./brunch-ledger-comment-anchor";

afterEach(() => {
  document.body.innerHTML = "";
});

/** An entity with a claim under it, then a second entity, marked as the Ledger document marks them. */
const mount = () => {
  document.body.innerHTML = `
    <article>
      <ul>
        <li>
          <span data-ledger-address="e1"><strong>Night crew</strong> — stated</span>
          <ul><li><span data-ledger-address="c1">Two people load each truck.</span></li></ul>
        </li>
        <li><span data-ledger-address="e2"><strong>Trucks</strong> — stated</span></li>
      </ul>
    </article>`;
  const article = document.querySelector("article");
  if (article === null) throw new Error("No article.");
  const record = (address: string) => {
    const element = article.querySelector(`[data-ledger-address="${address}"]`);
    if (element === null) throw new Error(`No record ${address}.`);
    return element;
  };
  return { article, record };
};

const textOf = (element: Element) => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode();
  if (node === null) throw new Error("No text.");
  return node;
};

test("a selection inside one record resolves to that record", () => {
  const { article, record } = mount();
  const range = document.createRange();
  range.setStart(textOf(record("c1")), 4);
  range.setEnd(textOf(record("c1")), 10);
  expect(selectedLedgerAddresses(range, article)).toEqual(["c1"]);
});

test("a selection across records resolves to each record it touches, in document order", () => {
  const { article, record } = mount();
  const range = document.createRange();
  range.setStart(textOf(record("e1")), 2);
  range.setEnd(textOf(record("e2")), 3);
  expect(selectedLedgerAddresses(range, article)).toEqual(["e1", "c1", "e2"]);
});

test("a selection that ends where the next record begins does not take that record", () => {
  const { article, record } = mount();
  const range = document.createRange();
  range.setStart(textOf(record("c1")), 0);
  range.setEnd(textOf(record("e2")), 0);
  expect(selectedLedgerAddresses(range, article)).toEqual(["c1"]);
});

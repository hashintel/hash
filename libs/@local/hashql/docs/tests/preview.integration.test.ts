import { describe, expect, test } from "@effect/vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ApiMember } from "../preview/components/api-member.js";
import { ApiSignature } from "../preview/components/api-signature.js";

describe("preview", () => {
  describe("facts", () => {
    test("member_source", () => {
      expect.hasAssertions();
      const html = renderToStaticMarkup(
        createElement(ApiMember, {
          name: "Box.value",
          title: "value",
          source: "https://example.test/Box.ts#L3",
        }),
      );
      expect(html).toContain('href="https://example.test/Box.ts#L3"');
    });

    test("declaration_facts", () => {
      expect.hasAssertions();
      const html = renderToStaticMarkup(
        createElement(ApiSignature, {
          overloads: [2],
          since: "0.4.0",
          stability: "experimental",
          source: "https://example.test/pick.ts#L9",
        }),
      );
      expect(html).toContain("Since 0.4.0");
      expect(html).toContain("experimental");
      expect(html).toContain('href="https://example.test/pick.ts#L9"');
    });

    test("unnumbered_declaration_facts", () => {
      expect.hasAssertions();
      const html = renderToStaticMarkup(
        createElement(ApiSignature, { since: "0.5.0" }),
      );
      expect(html).toContain("Since 0.5.0");
    });

    test("declaration_without_facts", () => {
      expect.hasAssertions();
      const html = renderToStaticMarkup(
        createElement(ApiSignature, { overloads: [1] }),
      );
      expect(html).not.toContain("api-facts");
    });
  });
});

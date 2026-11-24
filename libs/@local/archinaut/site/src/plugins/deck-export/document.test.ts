import { describe, expect, it } from "vitest";

import { exportedDocument } from "./document";

describe("exportedDocument", () => {
  it("inlines the styles and the script into one minified document", async () => {
    const html = await exportedDocument({
      title: "A & B <deck>",
      css: ".deck{color:red}",
      js: 'const end = "</script>"; mount();',
    });
    expect(html).toMatch(/^<!doctype html><html lang=en data-theme=dark>/u);
    expect(html).toContain("<title>A &amp; B &lt;deck&gt;</title>");
    expect(html).toContain("<style>.deck{color:red}</style>");
    expect(html).toContain('const end = "<\\/script>"; mount();');
    expect(html).not.toContain("\n");
  });
});

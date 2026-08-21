import { describe, expect, it } from "vitest";

import { buildCsvContent } from "./export-utils";

describe("buildCsvContent", () => {
  it("quotes and escapes multiline CSV values", () => {
    const csv = buildCsvContent(
      [
        {
          key: "comments",
          label: "Comments",
          source_field: null,
          source_table: null,
        },
      ],
      [{ comments: 'First line\nSecond "quoted" line' }],
    );

    expect(csv).toBe('"Comments"\n"First line\nSecond ""quoted"" line"');
  });

  it("neutralizes strings that spreadsheet applications treat as formulas", () => {
    const csv = buildCsvContent(
      [
        {
          key: "value",
          label: "Value",
          source_field: null,
          source_table: null,
        },
      ],
      [
        { value: '=HYPERLINK("https://example.com")' },
        { value: " \t+SUM(1,2)" },
        { value: "-identifier" },
        { value: "@author" },
        { value: 42 },
      ],
    );

    expect(csv).toContain(`"'=HYPERLINK(""https://example.com"")"`);
    expect(csv).toContain(`"' \t+SUM(1,2)"`);
    expect(csv).toContain("'-identifier");
    expect(csv).toContain("'@author");
    expect(csv).toContain("\n42");
  });

  it("escapes and neutralizes dynamic header metadata", () => {
    const csv = buildCsvContent(
      [
        {
          key: "value",
          label: '=Header "name"',
          source_field: "FIELD\nNAME",
          source_table: "@TABLE",
        },
      ],
      [{ value: "safe" }],
    );

    expect(csv).toBe(`"'=Header ""name"" (@TABLE.FIELD\nNAME)"\nsafe`);
  });
});

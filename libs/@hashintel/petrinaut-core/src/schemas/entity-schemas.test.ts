import { describe, expect, it } from "vitest";

import {
  componentSchema,
  disallowedComponentIconElement,
} from "./entity-schemas";

describe("disallowedComponentIconElement", () => {
  it("allows the root, groups and plain shapes", () => {
    expect(
      disallowedComponentIconElement(
        '<?xml version="1.0"?>\n<!-- drawn by hand -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><g><path d="M0 0h8"/><rect width="2" height="2"/><circle r="1"/><ellipse rx="2" ry="1"/><line x2="8" y2="8"/><polyline points="0,0 4,4"/><polygon points="0,0 4,4 0,4"></polygon></g></svg>',
      ),
    ).toBeUndefined();
  });

  it.each([
    ['<svg><use href="#a"/></svg>', "use"],
    ["<svg><defs><path/></defs></svg>", "defs"],
    ["<svg><title>Factory</title></svg>", "title"],
    ["<svg><style>path{fill:red}</style></svg>", "style"],
    ["<svg><script>alert(1)</script></svg>", "script"],
    ['<svg><image href="https://example.com/a.png"/></svg>', "image"],
    ["<svg><foreignObject><div/></foreignObject></svg>", "foreignObject"],
    ['<svg><animate attributeName="r"/></svg>', "animate"],
    ["<svg><text>A</text></svg>", "text"],
    ["<div><p>Hello</p></div>", "div"],
  ])("names the element %s may not hold", (markup, element) => {
    expect(disallowedComponentIconElement(markup)).toBe(element);
  });

  it("takes a name in another case or under a prefix for another element", () => {
    expect(disallowedComponentIconElement('<svg><USE href="#a"/></svg>')).toBe(
      "USE",
    );
    expect(
      disallowedComponentIconElement(
        '<svg xmlns:s="http://www.w3.org/2000/svg"><s:use href="#a"/></svg>',
      ),
    ).toBe("s:use");
    expect(disallowedComponentIconElement("<svg><Path/></svg>")).toBe("Path");
    expect(
      disallowedComponentIconElement("<svg:svg><svg:path/></svg:svg>"),
    ).toBe("svg:svg");
  });

  it("counts a tag wherever it stands: closing, in a comment, in an attribute or cut short", () => {
    expect(disallowedComponentIconElement("<svg></p></svg>")).toBe("p");
    expect(disallowedComponentIconElement("<svg><!-- <use/> --></svg>")).toBe(
      "use",
    );
    expect(disallowedComponentIconElement('<svg><path d="<use>"/></svg>')).toBe(
      "use",
    );
    expect(disallowedComponentIconElement("<svg><use")).toBe("use");
  });

  it("ends a name where an HTML parser does", () => {
    expect(disallowedComponentIconElement("<svg><path\u00a0d/></svg>")).toBe(
      "path\u00a0d",
    );
    expect(disallowedComponentIconElement("<svg><use\n/></svg>")).toBe("use");
    expect(
      disallowedComponentIconElement("<svg\t><g\f/><rect\r/></svg>"),
    ).toBeUndefined();
  });
});

describe("componentSchema icon", () => {
  const component = (iconSvg: string) => ({
    id: "component",
    name: "Component",
    iconSvg,
    places: [],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
  });

  it("accepts an icon of shapes", () => {
    expect(
      componentSchema.safeParse(
        component('<svg viewBox="0 0 8 8"><circle r="3"/></svg>'),
      ).success,
    ).toBe(true);
  });

  it("refuses any other element, and the message names it", () => {
    const result = componentSchema.safeParse(
      component('<svg viewBox="0 0 8 8"><mask id="m"><rect/></mask></svg>'),
    );

    expect(result.success).toBe(false);
    const [issue] = result.error?.issues ?? [];
    expect(issue?.path).toEqual(["iconSvg"]);
    expect(issue?.message).toBe(
      "An icon cannot hold a `mask` element: only svg, g, path, rect, circle, ellipse, line, polyline and polygon.",
    );
  });
});

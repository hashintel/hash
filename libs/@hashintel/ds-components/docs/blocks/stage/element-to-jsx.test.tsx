import { describe, expect, it } from "vitest";

import { elementToJsx } from "./element-to-jsx";

import type { ReactNode } from "react";

const Button = (_props: Record<string, unknown>) => null;
Button.displayName = "Button";

const Wrapper = ({ children }: { children?: ReactNode }) => children;

describe("elementToJsx", () => {
  it("serializes bare flags, false flags, numbers and plain strings", () => {
    expect(
      elementToJsx(
        <Button variant="subtle" pressed tabIndex={0}>
          Filters
        </Button>,
      ),
    ).toBe('<Button variant="subtle" pressed tabIndex={0}>Filters</Button>');
    expect(elementToJsx(<Button pressed={false}>Filters</Button>)).toBe(
      "<Button pressed={false}>Filters</Button>",
    );
  });

  it("serializes element props inline", () => {
    expect(
      elementToJsx(<Button suffix={<span>12</span>}>Comments</Button>),
    ).toBe("<Button suffix={<span>12</span>}>Comments</Button>");
  });

  it("keeps string props with quotes valid JSX", () => {
    expect(elementToJsx(<Button tooltip='Delete "Name"' />)).toBe(
      "<Button tooltip='Delete \"Name\"' />",
    );
    expect(elementToJsx(<Button tooltip={'Delete "O\'Brien"'} />)).toBe(
      '<Button tooltip={"Delete \\"O\'Brien\\""} />',
    );
  });

  it("keeps text children with JSX-significant characters literal", () => {
    expect(elementToJsx(<Button>{"Interpolate {name} here"}</Button>)).toBe(
      '<Button>{"Interpolate {name} here"}</Button>',
    );
  });

  it("serializes unnamed components transparently, as their children", () => {
    expect(
      elementToJsx(
        <Wrapper>
          <Button>Save</Button>
        </Wrapper>,
      ),
    ).toBe("<Button>Save</Button>");
  });
});

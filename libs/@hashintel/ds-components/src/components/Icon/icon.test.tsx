import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Checkbox } from "../Checkbox/checkbox";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { Icon, IconProvider } from "./icon";

import type { SVGProps } from "react";

const CustomIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...props} data-custom="true" />
);

describe("IconProvider", () => {
  it("preserves checked and indeterminate checkbox indicators with an icon pack", () => {
    const markup = renderToStaticMarkup(
      <IconProvider
        icons={{
          check: CustomIcon,
          dash: CustomIcon,
        }}
      >
        <Checkbox value onChange={() => {}} label="Checked option" />
        <Checkbox
          value={false}
          indeterminate
          onChange={() => {}}
          label="Partial option"
        />
      </IconProvider>,
    );
    expect(markup).not.toContain("data-custom");
    expect(markup).toContain('data-state="checked"');
    expect(markup).toContain('data-state="indeterminate"');
    expect(markup).toContain('d="M20 6 9 17l-5-5"');
    expect(markup).toContain('d="M5 12h14"');
  });

  it.each(["default", "bars"] as const)(
    "preserves the %s loading variant with an icon pack",
    (variant) => {
      const original = renderToStaticMarkup(
        <LoadingSpinner variant={variant} size="sm" />,
      );
      expect(
        renderToStaticMarkup(
          <IconProvider icons={{ loadingSpinner: CustomIcon }}>
            <LoadingSpinner variant={variant} size="sm" />
          </IconProvider>,
        ),
      ).toBe(original);
    },
  );

  it("uses the original icon when the pack does not contain its name", () => {
    const original = renderToStaticMarkup(<Icon name="table" size="sm" />);
    expect(
      renderToStaticMarkup(
        <IconProvider icons={{ play: CustomIcon }}>
          <Icon name="table" size="sm" />
        </IconProvider>,
      ),
    ).toBe(original);
  });

  it("preserves sizing and accessible labels on custom icons", () => {
    const markup = renderToStaticMarkup(
      <IconProvider icons={{ play: CustomIcon }}>
        <Icon name="play" size="sm" alt="Start simulation" />
      </IconProvider>,
    );
    expect(markup).toContain('data-custom="true"');
    expect(markup).toContain('aria-label="Start simulation"');
    expect(markup).toContain('role="img"');
    expect(markup).not.toContain('aria-hidden="true"');
    expect(markup).toContain('class="');
  });

  it("allows an inner provider to restore the default pack", () => {
    expect(
      renderToStaticMarkup(
        <IconProvider icons={{ play: CustomIcon }}>
          <IconProvider icons={{}}>
            <Icon name="play" />
          </IconProvider>
        </IconProvider>,
      ),
    ).toBe(renderToStaticMarkup(<Icon name="play" />));
  });
});

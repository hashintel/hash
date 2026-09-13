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
  it("replaces checkbox marks and loading indicators without changing their state", () => {
    const markup = renderToStaticMarkup(
      <IconProvider
        icons={{
          check: CustomIcon,
          dash: CustomIcon,
          loadingSpinner: CustomIcon,
        }}
      >
        <Checkbox value onChange={() => {}} label="Checked option" />
        <Checkbox
          value={false}
          indeterminate
          onChange={() => {}}
          label="Partial option"
        />
        <LoadingSpinner size="sm" />
        <LoadingSpinner variant="bars" size="xs" />
      </IconProvider>,
    );
    expect(markup.match(/data-custom="true"/g)).toHaveLength(4);
    expect(markup).toContain('data-state="checked"');
    expect(markup).toContain('data-state="indeterminate"');
    expect(markup).toContain("animation:none");
    expect(renderToStaticMarkup(<LoadingSpinner />)).not.toContain(
      "data-custom",
    );
    expect(
      renderToStaticMarkup(<Checkbox value onChange={() => {}} />),
    ).toContain("M20 6 9 17l-5-5");
  });

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

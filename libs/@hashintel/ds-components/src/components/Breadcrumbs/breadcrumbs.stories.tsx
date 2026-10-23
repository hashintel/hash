import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes, type FormInputSize } from "../../util/form-shared";
import { Button } from "../Button/button";
import { BreadCrumbs } from "./breadcrumbs";

import type { Meta, StoryObj } from "@storybook/react-vite";

const noop = () => undefined;

type BreadCrumbsProps = React.ComponentProps<typeof BreadCrumbs>;

// Distinct nav labels keep the landmarks unique when several trails share a
// page (and demonstrate the `aria-label` prop).
const Trail = ({
  withNoCollapse = false,
  withCustomItems = false,
  ...crumbProps
}: Partial<BreadCrumbsProps> & {
  /** Pins “Workspace” in the trail: it never joins the ellipsis menu. */
  withNoCollapse?: boolean;
  /** Adds a Button-children crumb. */
  withCustomItems?: boolean;
}) => (
  <BreadCrumbs {...crumbProps}>
    <BreadCrumbs.Item href="#home">Home</BreadCrumbs.Item>
    <BreadCrumbs.Item href="#workspace" noCollapse={withNoCollapse}>
      Workspace
    </BreadCrumbs.Item>
    {withCustomItems ? (
      <BreadCrumbs.Item>
        <Button size="xxs" variant="subtle" onClick={noop} autoFocus="never">
          Custom content
        </Button>
      </BreadCrumbs.Item>
    ) : null}
    <BreadCrumbs.Item href="#projects">Projects</BreadCrumbs.Item>
    <BreadCrumbs.Item href="#design-system">Design System</BreadCrumbs.Item>
    <BreadCrumbs.Item href="#components">Components</BreadCrumbs.Item>
    {/* No href/onClick: the current page is a plain, non-interactive crumb. */}
    <BreadCrumbs.Item>Breadcrumbs</BreadCrumbs.Item>
  </BreadCrumbs>
);

const IconTrail = ({
  withSubItems = false,
  withCustomItems = false,
  ...crumbProps
}: Partial<BreadCrumbsProps> & {
  /** Renders the “Entities” crumb as a dropdown menu instead of a link. */
  withSubItems?: boolean;
  /** Adds a Button-children crumb. */
  withCustomItems?: boolean;
}) => (
  <BreadCrumbs {...crumbProps}>
    <BreadCrumbs.Item href="#home" iconName="grid">
      Home
    </BreadCrumbs.Item>
    <BreadCrumbs.Item href="#workspace" iconName="cubes">
      Workspace
    </BreadCrumbs.Item>
    <BreadCrumbs.Item href="#projects" iconName="cube">
      Projects
    </BreadCrumbs.Item>
    <BreadCrumbs.Item href="#graph" iconName="diagramProject">
      Graph
    </BreadCrumbs.Item>
    {withCustomItems ? (
      <BreadCrumbs.Item>
        <Button size="xxs" variant="subtle" onClick={noop}>
          Custom content
        </Button>
      </BreadCrumbs.Item>
    ) : null}
    {withSubItems ? (
      <BreadCrumbs.Item
        iconName="table"
        subItems={[
          { children: "Users", href: "#users" },
          { children: "Documents", href: "#documents" },
          { children: "Events", onClick: noop },
        ]}
      >
        Entities
      </BreadCrumbs.Item>
    ) : (
      <BreadCrumbs.Item href="#entities" iconName="table">
        Entities
      </BreadCrumbs.Item>
    )}
    <BreadCrumbs.Item onClick={noop} iconName="file">
      Current entity
    </BreadCrumbs.Item>
  </BreadCrumbs>
);

const longName =
  "A very long workspace name that will be truncated when space runs out";

const column = css({
  display: "flex",
  flexDirection: "column",
  gap: "[32px]",
  maxWidth: "[960px]",
});

const example = css({
  display: "flex",
  flexDirection: "column",
  gap: "[6px]",
});

const label = css({
  fontSize: "[12px]",
  fontFamily: "[sans-serif]",
  color: "[#666]",
});

const resizable = css({
  resize: "horizontal",
  overflow: "auto",
  border: "[1px dashed #ccc]",
  borderRadius: "[6px]",
  padding: "[12px]",
  width: "[520px]",
  minWidth: "[70px]",
  maxWidth: "[100%]",
});

type Args = { size: FormInputSize; maxItems: number };

const meta = {
  title: "Components/Breadcrumbs",
  component: BreadCrumbs,
  args: {
    size: "md",
    maxItems: undefined,
  },
} satisfies Meta<BreadCrumbsProps>;

export default meta;

type Story = StoryObj<Args>;

const Example = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className={example}>
    <div className={label}>{title}</div>
    {children}
  </div>
);

export const Default: Story = {
  render: (args: Args) => (
    <div className={column}>
      <Example title="Regular">
        <Trail {...args} />
      </Example>

      <Example title="With icons">
        <IconTrail {...args} aria-label="Breadcrumb (icons)" />
      </Example>

      <Example title="Tooltip with custom items">
        <BreadCrumbs {...args} aria-label="Breadcrumb (tooltips)">
          <BreadCrumbs.Item href="#home" tooltip="Go to the home page">
            Home
          </BreadCrumbs.Item>
          <BreadCrumbs.Item href="#workspace" tooltip={longName}>
            {longName}
          </BreadCrumbs.Item>
          <BreadCrumbs.Item href="#projects" tooltip="Browse all projects">
            Projects
          </BreadCrumbs.Item>
          <BreadCrumbs.Item tooltip="An Item with Button children">
            <Button size="xxs" variant="subtle" onClick={noop}>
              Custom content
            </Button>
          </BreadCrumbs.Item>
          <BreadCrumbs.Item onClick={noop} tooltip="You are here">
            Current
          </BreadCrumbs.Item>
        </BreadCrumbs>
      </Example>

      <Example title="maxWidth = 120px (hover a truncated crumb for its full name)">
        <BreadCrumbs {...args} aria-label="Breadcrumb (maxWidth)">
          <BreadCrumbs.Item href="#home" maxWidth={120}>
            Home
          </BreadCrumbs.Item>
          <BreadCrumbs.Item href="#workspace" maxWidth={120}>
            {longName}
          </BreadCrumbs.Item>
          <BreadCrumbs.Item href="#projects" maxWidth={120}>
            Extremely long project title
          </BreadCrumbs.Item>
          <BreadCrumbs.Item maxWidth={120}>Current</BreadCrumbs.Item>
        </BreadCrumbs>
      </Example>

      <Example title="With sub-items (click a crumb with a chevron)">
        <BreadCrumbs {...args} aria-label="Breadcrumb (subItems)">
          <BreadCrumbs.Item href="#home">Home</BreadCrumbs.Item>
          <BreadCrumbs.Item
            subItems={[
              { children: "Experiment", href: "#experiment" },
              { children: "Analytics", href: "#analytics" },
              { children: "Reports", onClick: noop },
            ]}
          >
            Experiment
          </BreadCrumbs.Item>
          <BreadCrumbs.Item href="#analytics">Analytics</BreadCrumbs.Item>
          <BreadCrumbs.Item>Overview</BreadCrumbs.Item>
        </BreadCrumbs>
      </Example>

      <Example title="Sub-items collapsed into the ellipsis (nested submenu)">
        <BreadCrumbs
          {...args}
          maxItems={2}
          aria-label="Breadcrumb (nested subItems)"
        >
          <BreadCrumbs.Item href="#home">Home</BreadCrumbs.Item>
          <BreadCrumbs.Item
            subItems={[
              { children: "Experiment", href: "#experiment" },
              { children: "Analytics", href: "#analytics" },
            ]}
          >
            Experiment
          </BreadCrumbs.Item>
          <BreadCrumbs.Item>Overview</BreadCrumbs.Item>
        </BreadCrumbs>
      </Example>

      <Example title="maxItems = 3 (open the ellipsis: “Projects” renders a custom collapsed label)">
        <BreadCrumbs {...args} maxItems={3} aria-label="Breadcrumb (maxItems)">
          <BreadCrumbs.Item href="#home">Home</BreadCrumbs.Item>
          <BreadCrumbs.Item href="#workspace">Workspace</BreadCrumbs.Item>
          <BreadCrumbs.Item
            href="#projects"
            collapsedChildren={<em>All projects</em>}
          >
            Projects
          </BreadCrumbs.Item>
          <BreadCrumbs.Item href="#design-system">
            Design System
          </BreadCrumbs.Item>
          <BreadCrumbs.Item href="#components">Components</BreadCrumbs.Item>
          <BreadCrumbs.Item onClick={noop}>Breadcrumbs</BreadCrumbs.Item>
        </BreadCrumbs>
      </Example>

      <Example title="Overflow on resize (drag the handle → — “Workspace” never collapses)">
        <div className={resizable}>
          <Trail
            {...args}
            withNoCollapse
            withCustomItems
            aria-label="Breadcrumb (resizable)"
          />
        </div>
      </Example>
    </div>
  ),
};

/** Icons + `maxItems={3}` + sub-items and custom entries across every size. */
export const Sizes: Story = {
  render: (args: Args) => (
    <div className={column}>
      {formInputSizes.map((size) => (
        <Example key={size} title={size}>
          <IconTrail
            {...args}
            size={size}
            maxItems={4}
            withSubItems
            aria-label={`Breadcrumb (${size})`}
          />
        </Example>
      ))}
    </div>
  ),
};

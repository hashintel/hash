# Component documentation guidelines

How to write the `<component>.docs.mdx` page for a component in `src/components/`.

## Principles

1. **Document when and why, not what.** Answer "should I use this here?", "which variant?", and "what must I not do?". The rendered component already shows what it is so avoid prose that restates the UI, code or props table.
2. **Engineers first, designers second.** Design principles are mostly documented elsewhere, the main audience for these docs are users of the design system.
3. **Keep docs accurate and brief.**

## Page anatomy

Sections in order. "Required" applies to every component; others apply where indicated. Always follow this exact structure. Omit sections that don't apply — never pad or rename them, and never add additional sections not specified below.

| #   | Section                          | Applies to                                            |
| --- | -------------------------------- | ----------------------------------------------------- |
| 0   | Meta                             | required                                              |
| 1   | Title + one-line description     | required                                              |
| 2   | Hero example                     | required                                              |
| 3   | Installation                     | required                                              |
| 4   | When to use / When not to use    | required                                              |
| 5   | Anatomy                          | compound components (Dialog, Combobox, Menu, Select…) |
| 6   | Examples (one `###` per concept) | required                                              |
| 7   | Behavior                         | where non-obvious runtime behavior exists             |
| 8   | Content                          | components that render text the consumer writes       |
| 9   | Accessibility                    | required for interactive components                   |
| 10  | API reference                    | required                                              |
| 11  | Styling                          | where consumers style or extend the recipe            |

### 0. Meta

An exported `meta` block containing exactly these fields:

- `title` — the component name.
- `description` — identical to the one-liner under the H1.
- `alternativeNames` — the most common other names for the component or its UI pattern, including components that other design systems split out of it (Button implements icon-only and toggle buttons, so "IconButton" and "ToggleButton" belong here). Keep the list short — only genuinely common names.
- `links.source` — the complete GitHub URL to the component file: `https://github.com/hashintel/hash/blob/main/libs/@hashintel/ds-components/src/components/<Name>/<name>.tsx`.
- `links.stories` — the complete URL to the component's default/first story on the published Storybook: `https://tokens.hash.design/?path=/story/components-<name>--default` for a story file titled `Components/<Name>` whose first export is `Default` (confirm the id against the sidebar or `index.json`).
- `referenceLinks` — complete URLs to external reference material for the component's UI pattern, keyed by source; include each key only when it exists: `apg` (the WAI-ARIA Authoring Practices pattern, the same URL the Accessibility section links), `ark` (the underlying Ark UI component page for Ark-wrapped components), `mdn` (the native HTML element the component renders, where there is one).
- `related` — the related components in this design system, names only (no descriptions).

### 1. Title + one-line description

The H1 is the component name; the one-liner sits directly under it (and duplicated in `meta.description`). Directly below, a `ReferenceLinks` block (`docs/blocks/reference-links`) links `meta.links.source` and `meta.links.stories`.

Formula: **essence + primary purpose, ≤ 15 words, no feature list, no specs, do not repeat the component name.** It should complete "Use this to…" in the reader's head.

- Good: "Allow users to take actions, and make choices with a single click. They tell users what will happen next."
- Good: "A single field combining a text input with a filtered list of options."
- Bad: "A flexible, accessible button component supporting five variants, four sizes, icons, loading states and polymorphic rendering." (feature list, specs)

### 2. Hero example

One `<Stage>` immediately after the one-liner, showing a small _representative range_ — the default plus two or three instances that hint at the component's breadth (an icon variant, a different tone). Not a combinatoric matrix;

### 3. Installation

Two numbered steps, matching this output exactly (swap in the component and a small realistic usage):

````mdx
## Installation

1. Install the package.

```sh
npm install @hashintel/ds-components
```

2. Import the component.

```tsx
import { Button } from "@hashintel/ds-components";

export const CreateTypeButton = () => (
  <Button variant="solid" tone="brand" iconName="plus">
    Create type
  </Button>
);
```
````

### 4. When to use / When not to use

Two short lists rendered with `DoList`/`DontList` blocks.

- Phrase "when to use" items as situations, not features: "Use Banner to surface a page-level status the user didn't just cause."
- **Every "when not to use" item names the alternative or better approach**: "Don't use Button for navigation to another page — use a link instead."
- Quantify where you can: "For 4+ options use Select; for 3 or fewer use RadioGroup."

### 5. Anatomy (compound components)

A single JSX block showing every part in its nested position:

```tsx
<Combobox>
  <Combobox.Input />
  <Combobox.Content>
    <Combobox.Item />
  </Combobox.Content>
</Combobox>
```

### 6. Examples

The bulk of the page: one `## Examples` heading, then one `###` subsection per concept. Rules:

- **One concept per example.** Never demonstrate size and tone and icons in one block.
- **Heading = the feature, as a short sentence-case noun phrase**: "Sizes", "Loading", "Controlled", "With icon", "Grouped options", "Async search". Headings are the table of contents; make them answer "how do I…" searches.
- **Lead each example with at most 1–2 sentences** saying what it shows and when you'd reach for it. If you need a paragraph, the example is doing too much.
- **Order**: basic → states (disabled, loading, invalid) → controlled/uncontrolled → variant axes (size, tone, appearance) → content & composition (icons, grouping, custom rendering) → behavior (focus, overflow, async) → integration (forms, links, inside menus/dialogs).
- **Showcased props are always explicit.** When an example showcases a variant, set that prop in the code even when it's the default value (`variant="solid"`, `size="md"`) — the Code tab must teach the API, not rely on defaults the reader can't see.
- **Multi-variant examples are self-labelling where possible.** When one example renders several variants side by side, make each instance's label name its own variant ("Solid", "Subtle", "Ghost"; "xs", "md", "lg") so the preview reads without the Code tab.
- **Variant order matches the copy.** When the lead sentence lists the variants, render them in that same order.
- **Show states statically.** Render disabled/loading/invalid side by side; don't make readers hover or type to discover a state. Show overlays (tooltip, popover content) open where feasible.
- **Realistic content, HASH-domain content.** Outside self-labelling multi-variant comparisons, labels and data should look like the product: "Create type", "Invite teammate", entity and property names — never `foo`/`Click me`/lorem ipsum.
- **Snippets are standalone and copy-pasteable**: real imports, no shared fixtures or helpers invisible to the reader. People paste example code verbatim; it must be production quality. The Code tab shows the JSX inside `<Stage>` exactly as authored, formatting included — write it as the reader should copy it. Tag harness elements with `data-harness` to hide them from the code (the element's tags disappear, its children stay; `data-harness="omit"` drops the subtree), and give Stages whose harness uses render props (`OverlayDemo`) an explicit `code` override. Exception to standalone: example data an adjacent fenced block already defines (`const entityTypeItems = [...]`) may be referenced by name.
- Keep the example list **flat** — no sub-hierarchy of "basic/advanced" groupings.
- Count: roughly 5–10 examples for simple components, 10–15 for compound ones. Every prop that changes behavior should appear in at least one example; props that only need lookup live in the API table alone.

### 7. Behavior

Only for non-obvious runtime rules a reader would otherwise discover by surprise: text overflow and truncation, minimum/flexible width, focus movement on open/close, timing (e.g. "the loading state appears only after a short delay"), scroll handling. Skip it when there's nothing to say.

### 8. Content

For components that display consumer-written text (buttons, banners, inputs, tooltips): how to write that text, on this page, not linked elsewhere.

- Give the formula: "Labels are verb-first, 1–3 words, sentence case: 'Create type', 'Save draft'. No punctuation."
- Name the exceptions ("'Done' and 'Cancel' are established labels without nouns").
- For inputs: label vs placeholder vs helper-text division of labor, and error-message templates ("'[Field] must be [constraint]': 'Name must be 50 characters or fewer'").

### 9. Accessibility

Required for anything interactive. **If the [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/) has a pattern for the UI pattern the component implements, link it** — it carries the standard interaction model so the page doesn't restate it. Then up to two parts, in this order:

1. **What \<Component\> provides** (omit when empty) — guarantees the consumer would otherwise have to add or verify themselves, each tying a prop or part to its effect on assistive technology:
   - accessible-name and description wiring: which prop becomes the name (`alt`, `tooltip`), automatic label-id adoption;
   - built-in labels on internal controls ("Close dialog", "Remove [option text]");
   - focus behavior: initial focus, trapping, return target, tab order;
   - announcements: live regions, `aria-busy`, `role="alert"`;
   - form integration via hidden native inputs;
   - what assistive technology does **not** perceive (`aria-hidden` icons and dots).

   Don't restate the linked pattern's standard mechanics. Omit the subsection for thin conforming wrappers (Checkbox, NumberInput) — the intro link already says it all.

2. **What you must do** — the consumer's obligations: provide labels, don't disable without explanation, contrast rules for custom tones.

Add a **Keyboard** subsection (a Key | Action table) only when the component adds custom keyboard handling or strays from the APG pattern or native element behavior — and then document the deviation, not the standard. For standard-conformant components, the APG link covers it. For Ark-wrapped components, link the Ark UI component page for the underlying interaction model rather than restating it.

### 10. API reference

Generated, per exported part, with the `PropsTable` block (`docs/blocks/props-table`), which renders the react-docgen prop info attached to the component. Hand-written prose about a prop is not allowed — update the component's JSDoc descriptions instead.

```mdx
<PropsTable of={Component} defaults={{ variant: '"solid"', size: '"md"' }} />
```

Docgen cannot see defaults applied via body destructuring or recipe `defaultVariants`, so supply those per prop in `defaults`, as code strings.

Compound components get one table per part under `###` headings matching the anatomy.

### 11. Styling

Variant axes are documented as examples (§6); this section covers extension and theming only: which tokens drive it, and how to add a variant if that's supported.

## Do / don't guidance

Use side-by-side rendered pairs (not screenshots — they stay true to the code) inside the usage or content sections, sparingly: reserve them for genuinely confusable cases, roughly one pair per 5–10 text guidelines, not decoration.

- Caption below each half, starting with the verdict word: "**Do** use one solid button per view to mark the primary action." / "**Don't** stack multiple solid buttons — demote secondary actions to `outline`."
- Never provide copyable code for the Don't side.

## Writing style

- **Imperative, verb-first, second person, present tense, active voice, plain language.** "Use…", "Limit…", "Avoid…". Not "Buttons should ideally be used for…".
- **Guideline budget: ≤ 2 sentences each; sentences ≤ 25 words.** Lists over paragraphs. If a guideline needs more, it's probably two guidelines or an example.
- **Attach the reason as one clause.** "Avoid disabled buttons where possible — they have poor contrast and don't explain why they're unusable." A rule without a why gets relitigated.
- **Quantify.** "Keep labels under 4 words" beats "keep labels short".
- **Don't document implementation constants.** Concrete values such as `24px` or `100ms` are implementation details that drift as tokens change; describe the effect instead ("a short delay", "the narrowest preset"). Quantify guidance, not internals.
- **Two-tier modality.** _Always/Never/Must_ only for true invariants (mostly accessibility). _Use/Don't_ for defaults. _Consider/Avoid/Prefer_ for judgment calls.
- **Positive framing by default.** Say what to do; when you must say what not to do, provide a solution ("Instead, use…").
- **Headings are descriptive and searchable**, never "Overview", "Introduction", "Misc".

## Repo mechanics

- File: `src/components/<Name>/<name>.docs.mdx`
- MDX is not type-checked: prop values the compiler would catch in TSX (e.g. an invalid `iconName`) crash at render time instead, so test every doc change.
- MDX wraps multiline JSX text children in a `<p>`; the docs pipeline (`.storybook/rehype-markdown-class.ts`) unwraps it again when it is a component's only child, so multiline text children are safe to write naturally. Only deliberate multi-paragraph content inside a component keeps its paragraphs.

## Page skeleton

```mdx
import { Meta } from "@storybook/addon-docs/blocks";

import { DoList, DontList } from "../../../docs/blocks/do-dont-list";
import { PropsTable } from "../../../docs/blocks/props-table";
import { ReferenceLinks } from "../../../docs/blocks/reference-links";
import { Stage } from "../../../docs/blocks/stage";
import { Component } from "./component";

<Meta title="Docs/Component" />

export const meta = {
  title: "Component",
  description: "One-liner, ≤15 words, purpose not features.",
  alternativeNames: ["OtherCommonName"],
  links: {
    source:
      "https://github.com/hashintel/hash/blob/main/libs/@hashintel/ds-components/src/components/Component/component.tsx",
    stories:
      "https://tokens.hash.design/?path=/story/components-component--default",
  },
  referenceLinks: {
    apg: "https://www.w3.org/WAI/ARIA/apg/patterns/<pattern>/",
    ark: "https://ark-ui.com/docs/components/<component>",
    mdn: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/<element>",
  },
  related: ["OtherComponent"],
};

# Component

One-liner, identical to `meta.description`.

<ReferenceLinks
  links={[
    { label: "Source", href: meta.links.source, iconName: "code" },
    { label: "Stories", href: meta.links.stories },
  ]}
/>

<Stage>{/* representative range */}</Stage>

## Installation {/* two numbered steps: npm install + import-with-usage, see §3 */}

### When to use {/* DoList */}

### When not to use {/* DontList */}

## Anatomy {/* compound only */}

## Examples

### Basic {/* then one ### per example concept */}

## Behavior {/* only if non-obvious */}

## Content {/* only if it renders consumer text */}

## Accessibility {/* APG pattern link; Keyboard only for deviations */}

## API reference

<PropsTable of={Component} defaults={{ size: '"md"' }} />
```

## References

- Nathan Curtis, EightShapes series: [Documenting Components](https://medium.com/eightshapes-llc/documenting-components-9fe59b80c015), [Component Introductions](https://medium.com/eightshapes-llc/documenting-component-introductions-fe5b04287284), [Component Examples](https://medium.com/eightshapes-llc/component-examples-9c4b3bb3b308), [Component Design Guidelines](https://medium.com/eightshapes-llc/component-design-guidelines-eca706100e7c), [Authoring Component Documentation](https://medium.com/eightshapes-llc/authoring-component-documentation-6f894b498b88)
- [Amy Hupe: how GOV.UK documents components](https://designnotes.blog.gov.uk/2018/11/05/how-we-document-components-and-patterns-in-the-gov-uk-design-system/), [integrating content guidelines](https://amyhupe.co.uk/articles/integrating-content-guidelines-in-design-systems/); [GOV.UK writing guidelines](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/)
- Corporate systems: [Carbon](https://carbondesignsystem.com/components/button/usage/), [Polaris](https://github.com/Shopify/polaris/blob/main/polaris.shopify.com/content/components/actions/button.mdx), [Atlassian](https://atlassian.design/components/button/usage), [Spectrum](https://spectrum.adobe.com/web/rsp/components/button), [Primer (incl. their authoring guide)](https://primer.style/product/contribute/documentation/), [Material 3](https://m3.material.io/components/buttons/guidelines), [GOV.UK](https://design-system.service.gov.uk/components/button/)
- Code-first libraries: [Radix](https://www.radix-ui.com/primitives/docs/components/select), [Base UI](https://base-ui.com/react/components/select), [Ark UI](https://ark-ui.com/docs/components/combobox), [Chakra v3](https://chakra-ui.com/docs/components/button), [Mantine](https://mantine.dev/core/button/), [React Aria](https://react-aria.adobe.com/Select)
- Storybook: [writing docs](https://storybook.js.org/docs/writing-docs), [doc blocks](https://storybook.js.org/docs/writing-docs/doc-blocks), [how to document a design system](https://storybook.js.org/blog/how-to-document-your-design-system-best-practices-tools/); [Workday Canvas Kit MDX standardization](https://github.com/Workday/canvas-kit/discussions/1131)
- [Brad Frost, Atomic Design ch. 5](https://atomicdesign.bradfrost.com/chapter-5/); Alla Kholmatova, _Design Systems_ / [The Language of Modular Design](https://alistapart.com/article/language-of-modular-design/); [Ross Moody](https://rossmoody.com/writing/effective-ds-documentation); [zeroheight](https://zeroheight.com/blog/how-to-document-your-design-system-components/); [Diátaxis](https://diataxis.fr/)

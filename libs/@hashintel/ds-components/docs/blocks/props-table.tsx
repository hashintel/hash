import Markdown from "react-markdown";

import { Chip } from "../../src/components/Chip/chip";
import { InlineHighlight } from "../../src/util/InlineHighlight/inline-highlight";
import { propsTableRecipe } from "./props-table.recipe";
import { docgenRegistry } from "./props-table/docgen-registry.gen";

import type {
  ComponentDoc,
  PropItem,
  PropItemType,
} from "react-docgen-typescript";
import type { Components } from "react-markdown";

/**
 * Props reference table for MDX docs pages. react-docgen-typescript cannot see defaults applied via body
 * destructuring or recipe defaultVariants, so `defaults` lets pages supply them per prop.
 */

/**
 * react-docgen-typescript's output types, projected to the fields the table
 * renders and with the `any`-typed value fields (`PropItemType.value`,
 * `PropItem.defaultValue`) narrowed to the shapes the producer emits.
 */
type DocgenType = Pick<PropItemType, "name" | "raw"> & {
  value?: { value?: string }[];
};

type DocgenProp = Pick<PropItem, "description" | "required"> & {
  type: DocgenType;
  defaultValue?: { value?: string } | null;
};

/** `ComponentDoc["props"]` under the projected prop shape. */
type DocgenInfo = { props?: Record<keyof ComponentDoc["props"], DocgenProp> };

/**
 * Glue each `|` to the member after it so wraps read like multi-line TS unions (`| member` starts the
 * line) and never strand a `|` alone. An nbsp alone can't glue it: `|` is a break-after character, and
 * UAX #14 rule LB12a allows a break between those and a following nbsp — the U+2060 WORD JOINER
 * (rule LB11, no exceptions) bridges the two.
 */
const glueUnionPipes = (text: string): string =>
  text.replace(/\s*\|\s*/g, " |\u2060\u00A0");

const formatType = (type: DocgenType): string => {
  const literals = (type.value ?? [])
    .map((member) => member.value)
    .filter((value): value is string => typeof value === "string");
  let formatted: string;
  if (literals.length > 0) {
    const joined = literals.join(" | ");
    const alias = type.raw ?? type.name;
    if (joined.length <= 70) {
      formatted = joined;
    } else if (alias.length <= 70) {
      formatted = alias;
    } else {
      const shown = literals.slice(0, 4);
      formatted = `${shown.join(" | ")} | … ${literals.length - shown.length} more`;
    }
  } else {
    formatted = type.raw ?? type.name;
  }
  return glueUnionPipes(formatted);
};

/**
 * TSDoc's `{@link target}` / `{@link target | label}` inline tags are not
 * markdown — docgen passes them through literally. Rewrite URL targets into
 * markdown links and symbol targets into code spans before rendering.
 */
const unwrapLinkTags = (text: string): string =>
  text.replace(
    /\{@link(?:code|plain)?\s+([^}|]+?)(?:\s*\|\s*([^}]+))?\s*\}/g,
    (_match, target: string, label?: string) => {
      const trimmedTarget = target.trim();
      const name = label?.trim() ?? trimmedTarget;
      return /^https?:\/\//.test(trimmedTarget)
        ? `[${name}](${trimmedTarget})`
        : `\`${name}\``;
    },
  );

const markdownComponents: Components = {
  // Inline code matches the type column; fenced blocks keep a plain <code>.
  code: ({ className, children }) =>
    /language-/.test(className ?? "") ? (
      <code className={className}>{children}</code>
    ) : (
      <InlineHighlight>{children}</InlineHighlight>
    ),
};

const classes = propsTableRecipe();

export const PropsTable = ({
  of,
  defaults = {},
}: {
  /** The component whose docgen prop info should be rendered. */
  of: object;
  /** Per-prop default values docgen cannot infer, e.g. `{ size: '"md"' }`. */
  defaults?: Record<string, string>;
}) => {
  // Storybook's bundler attaches __docgenInfo; the published docs bundles
  // carry the same data in the generated registry instead.
  const docgen: DocgenInfo | undefined =
    (of as { __docgenInfo?: DocgenInfo }).__docgenInfo ??
    docgenRegistry.get(of);
  // Required props first; the stable sort keeps declaration order within each group.
  const props = Object.entries(docgen?.props ?? {}).sort(
    ([, a], [, b]) => Number(b.required) - Number(a.required),
  );
  const hasDescriptions = props.some(([, prop]) => !!prop.description);
  const columns = hasDescriptions
    ? ["Prop", "Type", "Description"]
    : ["Prop", "Type"];

  return (
    <table className={classes.table}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} className={classes.headerCell}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.map(([name, prop]) => {
          const defaultValue = defaults[name] ?? prop.defaultValue?.value;
          return (
            <tr key={name}>
              <td className={classes.propCell}>
                {name}
                {prop.required ? (
                  <div className={classes.requiredChip}>
                    <Chip size="xxs" color="red" variant="defined">
                      required
                    </Chip>
                  </div>
                ) : null}
              </td>
              <td className={classes.typeCell}>
                <div>
                  <InlineHighlight>{formatType(prop.type)}</InlineHighlight>
                </div>
                {defaultValue === undefined ? null : (
                  <div className={classes.defaultNote}>
                    default: <InlineHighlight>{defaultValue}</InlineHighlight>
                  </div>
                )}
              </td>
              {hasDescriptions ? (
                <td className={classes.descriptionCell}>
                  {prop.description ? (
                    <Markdown components={markdownComponents}>
                      {unwrapLinkTags(prop.description)}
                    </Markdown>
                  ) : null}
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

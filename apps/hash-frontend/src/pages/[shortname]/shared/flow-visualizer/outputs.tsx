import { IconButton } from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { Entity } from "@local/hash-graph-sdk/entity";
import type {
  PersistedEntity,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/flows/types";
import type { SvgIconProps } from "@mui/material";
import { Box, Stack, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { useMemo, useState } from "react";

import type { FlowRun } from "../../../../graphql/api-types.gen";
import { useFlowRunsContext } from "../../../shared/flow-runs-context";
import { getFileProperties } from "../../../shared/get-file-properties";
import { Deliverables } from "./outputs/deliverables";
import type { DeliverableData } from "./outputs/deliverables/shared/types";
import { EntityResultTable } from "./outputs/entity-result-table";
import { PersistedEntityGraph } from "./outputs/persisted-entity-graph";
import { outputIcons } from "./outputs/shared/icons";
import { SectionLabel } from "./section-label";

const testMarkdown: DeliverableData = {
  displayName: "Research Report",
  markdown: `
# h1 Heading

Paragraph

## h2 Heading

Paragraph

Paragraph

# h1

## h2

Paragraph

### h3 Heading

Paragraph

Paragraph

#### h4 Heading

Paragraph

##### h5 Heading

Paragraph

###### h6 Heading

Paragraph



## Horizontal Rules

___

---

***


## Typographic replacements

Enable typographer option to see result.

(c) (C) (r) (R) (tm) (TM) (p) (P) +-

test.. test... test..... test?..... test!....

!!!!!! ???? ,,  -- ---

"Smartypants, double quotes" and 'single quotes'


## Emphasis

**This is bold text**

__This is bold text__

*This is italic text*

_This is italic text_

~~Strikethrough~~


## Blockquotes


> Blockquotes can also be nested...
>> ...by using additional greater-than signs right next to each other...
> > > ...or with spaces between arrows.


## Lists

Unordered

+ Create a list by starting a line with \`+\`, \`-\`, or \`*\`
+ Sub-lists are made by indenting 2 \`spaces\`:
  - Marker character change forces new list start:
    * Ac tristique libero volutpat at
    + Facilisis in pretium nisl aliquet
    - Nulla volutpat aliquam velit
+ Very easy!

Ordered

1. Lorem ipsum dolor sit amet
2. Consectetur adipiscing elit
3. Integer molestie lorem at massa


1. You can use sequential numbers...
1. ...or keep all the numbers as \`1.\`

Start numbering with offset:

57. foo
1. bar


## Code

Inline \`code\`

Indented code

    // Some comments
    line 1 of code
    line 2 of code
    line 3 of code


Block code "fences"

\`\`\`js
Sample text here...
\`\`\`

Syntax highlighting

\`\`\`ts
var foo = function (bar) {
  return bar++;
};

console.log(foo(5));
\`\`\`

## Tables

| Option | Description |
| ------ | ----------- |
| data   | path to data files to supply the data that will be passed into templates. |
| engine | engine to be used for processing templates. Handlebars is the default. |
| ext    | extension to be used for dest files. |

Right aligned columns

| Option | Description |
| ------:| -----------:|
| data   | path to data files to supply the data that will be passed into templates. |
| engine | engine to be used for processing templates. Handlebars is the default. |
| ext    | extension to be used for dest files. |


## Links

[link text](http://dev.nodeca.com)

[link with title](http://nodeca.github.io/pica/demo/ "title text!")

Autoconverted link https://github.com/nodeca/pica (enable linkify to see)


## Images

![Minion](https://octodex.github.com/images/minion.png)

![Stormtroopocat](https://octodex.github.com/images/stormtroopocat.jpg "The Stormtroopocat")

Like links, Images also have a footnote style syntax

![Alt text][id]

With a reference later in the document defining the URL location:

[id]: https://octodex.github.com/images/dojocat.jpg  "The Dojocat"
`,
  type: "markdown",
};

export const getDeliverables = (
  outputs?: FlowRun["outputs"],
): DeliverableData[] => {
  const flowOutputs = outputs?.[0]?.contents?.[0]?.outputs;

  const deliverables: DeliverableData[] = [testMarkdown];

  for (const output of flowOutputs ?? []) {
    const { payload } = output;

    if (payload.kind === "FormattedText" && !Array.isArray(payload.value)) {
      if (payload.value.format === "Markdown") {
        const markdown = payload.value.content;
        deliverables.push({
          displayName: "Markdown",
          type: "markdown",
          markdown,
        });
      }
    }
    if (payload.kind === "PersistedEntity" && !Array.isArray(payload.value)) {
      if (!payload.value.entity) {
        continue;
      }
      const entity = new Entity(payload.value.entity);

      const { displayName, fileName, fileUrl } = getFileProperties(
        entity.properties,
      );

      if (fileUrl) {
        deliverables.push({
          displayName,
          entityTypeId: entity.metadata.entityTypeId,
          fileName,
          fileUrl,
          type: "file",
        });
      }
    }
  }

  return deliverables;
};

const VisibilityButton = ({
  active,
  label,
  Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  Icon: FunctionComponent<SvgIconProps>;
  onClick: () => void;
}) => (
  <IconButton
    onClick={onClick}
    sx={({ palette }) => ({
      p: 0,
      svg: {
        fontSize: 15,
      },
      "&:hover": {
        background: "none",
        svg: {
          background: active ? palette.gray[20] : palette.blue[20],
          fill: active ? palette.gray[50] : palette.blue[70],
        },
        "> div": { background: active ? palette.gray[20] : palette.blue[20] },
        span: { color: active ? palette.gray[60] : palette.common.black },
      },
    })}
  >
    <Box
      sx={{
        background: ({ palette }) =>
          active ? palette.blue[20] : palette.gray[20],
        borderRadius: "50%",
        p: "4.5px",
        transition: ({ transitions }) => transitions.create("background"),
        width: 24,
        height: 24,
      }}
    >
      <Icon
        sx={({ palette }) => ({
          color: active ? palette.blue[70] : palette.gray[50],
          display: "block",
        })}
      />
    </Box>

    <Typography
      component="span"
      sx={{
        color: ({ palette }) =>
          active ? palette.common.black : palette.gray[60],
        fontSize: 13,
        fontWeight: 500,
        ml: 0.5,
        transition: ({ transitions }) => transitions.create("color"),
      }}
    >
      {label}
    </Typography>
  </IconButton>
);

type OutputsProps = {
  persistedEntities: PersistedEntity[];
  proposedEntities: ProposedEntity[];
};

type SectionVisibility = {
  deliverables: boolean;
  graph: boolean;
  table: boolean;
};

export const Outputs = ({
  persistedEntities,
  proposedEntities,
}: OutputsProps) => {
  const { selectedFlowRun } = useFlowRunsContext();

  const deliverables = useMemo(
    () => getDeliverables(selectedFlowRun?.outputs),
    [selectedFlowRun],
  );

  const [sectionVisibility, setSectionVisibility] = useState<SectionVisibility>(
    {
      table: true,
      graph: true,
      deliverables: true,
    },
  );

  return (
    <>
      <Stack alignItems="center" direction="row" gap={2} mb={0.5}>
        <SectionLabel text="Outputs" />
        {typedEntries(sectionVisibility).map(([section, visible]) => (
          <VisibilityButton
            key={section}
            label={`${section[0]!.toUpperCase()}${section.slice(1)}`}
            active={visible}
            Icon={outputIcons[section]}
            onClick={() =>
              setSectionVisibility((prev) => ({
                ...prev,
                [section]: !visible,
              }))
            }
          />
        ))}
      </Stack>
      <Stack
        alignItems="center"
        direction="row"
        flex={1}
        gap={1}
        sx={{
          maxWidth: "100%",
          overflowX: "auto",
        }}
      >
        {sectionVisibility.table && (
          <EntityResultTable
            persistedEntities={persistedEntities}
            proposedEntities={proposedEntities}
          />
        )}

        {sectionVisibility.graph && (
          <PersistedEntityGraph persistedEntities={persistedEntities} />
        )}

        {sectionVisibility.deliverables && (
          <Deliverables deliverables={deliverables} />
        )}
      </Stack>
    </>
  );
};

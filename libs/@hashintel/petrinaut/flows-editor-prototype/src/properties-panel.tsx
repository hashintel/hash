import { useRef } from "react";

import {
  Button,
  Icon,
  Menu,
  NumberInput,
  SegmentedControl,
  Select,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { OverlayScrollArea } from "../../src/ui/components/overlay-scroll-area";
import { forEachEntry, getCatalogEntry, type InputView } from "./catalog";
import {
  START_ID,
  addTrigger,
  type DraftActionStep,
  type DraftForEachStep,
  type EditorDocument,
  entityTypeOf,
  findStep,
  itemName,
  stepLabel,
  findTrigger,
  removeStep,
  removeTrigger,
  updateStep,
  updateTrigger,
  usersOf,
} from "./document";
import {
  inScreenState,
  showDebug,
  showFull,
  useEditor,
} from "./editor-context";
import {
  allPayloadKinds,
  type PayloadKind,
  type StepInputSource,
} from "./engine";
import {
  isFreeText,
  inputHover,
  ListField,
  ListSourceField,
  listModeOf,
  MentionField,
  PatchField,
  PropertyField,
  QueryField,
  ValueField,
} from "./fields";
import { isMockPayloadKind } from "./mock-action-definitions";
import { findEntityType, mockEntities, mockEntityTypes } from "./mock-graph";
import {
  describeCron,
  fromCron,
  type Repeat,
  toCron,
  type InputMapping as InputMappingValue,
  type TriggerKind,
  type TriggerNode,
  triggerDefinitions,
  addableTriggerKinds,
  isEntityTrigger,
  weekdays,
} from "./mock-triggers";
import {
  acceptedKinds,
  describeSource,
  getItemShape,
  getSourceShape,
} from "./shapes";
import { SourceMenu } from "./source-menu";
import { firstAndMore, TimeField, TypedValue } from "./typed-value";
import {
  descriptionInputStyle,
  HeaderTitle,
  keyHoverStyle,
  keyStyle,
  kindLabel,
  mutedTextStyle,
  OriginMark,
  panelHeaderStyle,
  PropertyRow,
  Section,
  ChipRow,
  SourceChip,
  SourceSelectTrigger,
  type Tone,
  typeLineStyle,
} from "./ui";

import type { IconName } from "@hashintel/ds-components";

/** Docked on the right, full height, as on ↳ Current: 420 wide, a hairline on its left, 16 px in, 20 px between blocks. */
const panelStyle = css({
  position: "relative",
  flexShrink: 0,
  width: "[384px]",
  height: "[100%]",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "neutral.bgSolid.min",
  borderLeftWidth: "thin",
  borderLeftStyle: "solid",
  borderLeftColor: "neutral.bd.solid",
  zIndex: "[5]",
});

/** The panel's content, inside Petrinaut's thin overlay scrollbar (no native scrollbars). */
const panelBodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "5",
  padding: "4",
});

/** The icon and tile colour a node shows on the canvas, for the chips that point at it. */
const nodeLook = (
  document: EditorDocument,
  id: string,
): { icon: IconName; tone: Tone } => {
  if (id === START_ID) {
    return { icon: "play", tone: "neutral" };
  }
  const trigger = findTrigger(document, id);
  if (trigger) {
    return { icon: triggerDefinitions[trigger.kind].icon, tone: "blue" };
  }
  const step = findStep(document, id)?.step;
  if (step?.kind === "for-each") {
    return { icon: "rotate", tone: "green" };
  }
  const entry = step ? getCatalogEntry(step.actionDefinitionId) : undefined;
  return { icon: entry?.icon ?? "cube", tone: entry?.tone ?? "green" };
};

/** An empty value ("Ends here", "Not used yet"): the value's size, in the subtle colour of an empty state. */
const emptyValueStyle = css({ textStyle: "sm", color: "neutral.fg.subtle" });

/** "Used by" chips: which steps read a value (D26 A, folded into D27 A). */
const UsedBy = ({
  match,
  quiet = false,
}: {
  match: (source: StepInputSource) => boolean;
  /** Show nothing, rather than "Not used yet", when no step reads the value. */
  quiet?: boolean;
}) => {
  const { document, setUi } = useEditor();
  const users = usersOf(document, match);
  if (users.length === 0) {
    return quiet ? null : <span className={emptyValueStyle}>Not used yet</span>;
  }
  return (
    <ChipRow
      names={users.map((userId) => {
        const user = findStep(document, userId)?.step;
        return user ? stepLabel(user) : userId;
      })}
    >
      {users.map((userId) => {
        const user = findStep(document, userId)?.step;
        return (
          <SourceChip
            key={userId}
            icon={nodeLook(document, userId).icon}
            onClick={() =>
              setUi((ui) => ({ ...ui, selectedId: userId, openField: null }))
            }
          >
            {user ? stepLabel(user) : userId}
          </SourceChip>
        );
      })}
    </ChipRow>
  );
};

const Paths = ({
  stepId,
  ports,
}: {
  stepId: string;
  ports: { outputName: string; label: string }[];
}) => {
  const { document, setUi } = useEditor();
  if (!showFull) {
    return null;
  }
  return (
    <Section title="Paths">
      {ports.map((port) => {
        const targets = document.wires.filter(
          (wire) =>
            wire.source === stepId && wire.sourcePort === port.outputName,
        );
        return (
          <PropertyRow key={port.outputName} label={port.label}>
            {targets.length === 0 ? (
              <span className={emptyValueStyle}>Ends here</span>
            ) : (
              <ChipRow
                names={targets.map((wire) => {
                  const target = findStep(document, wire.target)?.step;
                  return target ? stepLabel(target) : wire.target;
                })}
              >
                {targets.map((wire) => (
                  <SourceChip
                    key={wire.id}
                    icon={nodeLook(document, wire.target).icon}
                    onClick={() =>
                      setUi((ui) => ({ ...ui, selectedId: wire.target }))
                    }
                  >
                    {(() => {
                      const target = findStep(document, wire.target)?.step;
                      return target
                        ? stepLabel(target)
                        : wire.target === START_ID
                          ? "Start"
                          : wire.target;
                    })()}
                  </SourceChip>
                ))}
              </ChipRow>
            )}
          </PropertyRow>
        );
      })}
    </Section>
  );
};

/** Fields and sections the Figma panels leave out; `?full` brings them back. */
const trimmedInputs: Record<string, string[]> = {
  sendEmail: ["cc", "body", "senderAddress", "attachments"],
  getFileFromUrl: ["description", "displayName"],
};

/** The labels Figma uses where the draft PRD's or the humanized name differs. */
const inputLabels: Record<string, string> = {
  "sendEmail.to": "To",
  "getFileFromUrl.url": "URL",
  "getWebPageByUrl.url": "URL",
};

const Checks = ({ stepId }: { stepId: string }) => {
  const { validation } = useEditor();
  if (!showDebug) {
    return null;
  }
  const problems = validation.byStep.get(stepId) ?? [];
  if (problems.length === 0) {
    return null;
  }
  return (
    <Section title="Engine checks">
      {problems.map((problem, index) => (
        <div
          // eslint-disable-next-line react/no-array-index-key -- messages can repeat
          key={index}
          className={css({
            textStyle: "xs",
            color:
              problem.severity === "error"
                ? "red.fg.muted"
                : "neutral.fg.muted",
          })}
        >
          {problem.message}
        </div>
      ))}
    </Section>
  );
};

const DescriptionInput = ({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (next: string) => void;
}) => (
  <input
    className={descriptionInputStyle}
    value={value}
    placeholder="Add a description…"
    aria-label={label}
    onChange={(event) => onChange(event.target.value)}
  />
);

/** Delete sits top right and shows on hover or focus, so the header reads as in Figma at rest. */
const headerActionStyle = css({
  position: "absolute",
  top: "[-6px]",
  right: "[-4px]",
  transition: "[opacity 0.15s ease]",
});

const PanelHeader = ({
  icon,
  type,
  origin,
  stepId,
  description,
  trigger,
  subtitle,
}: {
  icon: IconName;
  type: string;
  origin?: React.ReactNode;
  stepId?: string;
  description?: string;
  /** A trigger node: its description and delete act on the trigger. */
  trigger?: TriggerNode;
  /** Static text under the title, in place of the description field. */
  subtitle?: string;
}) => {
  const { setDocument, setUi } = useEditor();
  const onDelete = trigger
    ? trigger.id === START_ID
      ? null
      : () => {
          setDocument((document) => removeTrigger(document, trigger.id));
          setUi((ui) => ({ ...ui, selectedId: START_ID, triggerId: null }));
        }
    : stepId
      ? () => {
          setDocument((document) => removeStep(document, stepId));
          setUi((ui) => ({ ...ui, selectedId: null }));
        }
      : null;
  const what = trigger ? "trigger" : "step";
  return (
    <div className={panelHeaderStyle}>
      <HeaderTitle icon={icon}>
        <span className={typeLineStyle}>{type}</span>
        {origin}
      </HeaderTitle>
      {subtitle ? (
        <span className={descriptionInputStyle}>{subtitle}</span>
      ) : trigger ? (
        <DescriptionInput
          label="Trigger description"
          value={trigger.description}
          onChange={(next) =>
            setDocument((document) =>
              updateTrigger(document, trigger.id, (current) => ({
                ...current,
                description: next,
              })),
            )
          }
        />
      ) : stepId && description !== undefined ? (
        <DescriptionInput
          label="Step description"
          value={description}
          onChange={(next) =>
            setDocument((document) =>
              updateStep(document, stepId, (step) => ({
                ...step,
                description: next,
              })),
            )
          }
        />
      ) : null}
      {onDelete ? (
        <span className={headerActionStyle} data-header-action>
          <Button
            size="xs"
            variant="ghost"
            iconName="trash"
            aria-label={`Delete ${what}`}
            tooltip={`Delete ${what}`}
            onClick={onDelete}
          />
        </span>
      ) : null}
    </div>
  );
};

const fieldFor = (
  document: EditorDocument,
  step: DraftActionStep,
  input: InputView,
) => {
  const entry = getCatalogEntry(step.actionDefinitionId)!;
  const kinds = input.kinds ?? [];
  const props = { step, input, entry };
  if (kinds.includes("EntityQuery")) {
    return <QueryField {...props} mode="query" />;
  }
  if (kinds.includes("FilterCondition")) {
    const subjectInput = step.inputs.items ?? step.inputs.value;
    const typeHint = entityTypeOf(document, subjectInput, step.stepId);
    return <QueryField {...props} mode="condition" typeHint={typeHint} />;
  }
  if (kinds.includes("EntityProperty")) {
    return <PropertyField {...props} />;
  }
  if (
    kinds.includes("PropertyPatch") ||
    kinds.includes("PropertyObjectWithMetadata")
  ) {
    return <PatchField {...props} />;
  }
  if (input.array) {
    return listModeOf(input) === "reference" ? (
      <ListSourceField {...props} />
    ) : (
      <ListField {...props} />
    );
  }
  if (isFreeText(input)) {
    return <MentionField {...props} />;
  }
  return <ValueField {...props} />;
};

const ActionPanel = ({ step }: { step: DraftActionStep }) => {
  const { document, ui, validation } = useEditor();
  const entry = getCatalogEntry(step.actionDefinitionId);
  if (!entry) {
    return null;
  }
  const origin = !showDebug ? null : entry.origin.kind === "open-pr" ? (
    <OriginMark
      label={`#${entry.origin.pr}`}
      hover={`Defined in open PR #${entry.origin.pr}, not on main yet`}
    />
  ) : entry.origin.kind === "mock" ? (
    <OriginMark label="mock" hover={entry.origin.why} />
  ) : null;

  const hidden = showFull ? [] : (trimmedInputs[step.actionDefinitionId] ?? []);
  const visibleInputs = entry.inputs.filter(
    (input) => !hidden.includes(input.name),
  );

  const outputKind = (outputName: string) => {
    const shape = getSourceShape(
      document,
      { kind: "step-output", stepId: step.stepId, outputName },
      step.stepId,
    );
    return shape
      ? kindLabel(shape.payloadKind, shape.array)
      : "Kind not known until its input is set";
  };

  return (
    <>
      <PanelHeader
        icon={entry.icon}
        type={entry.title}
        origin={origin}
        stepId={step.stepId}
        description={step.description}
      />
      {visibleInputs.length > 0 ? (
        <Section
          title={ui.hideInputsHeader && !showFull ? undefined : "Inputs"}
        >
          {visibleInputs.map((input) => {
            const kinds = acceptedKinds(document, step.stepId, input, entry);
            // Query builders stack: key above, builder below (Journey 3).
            if (
              kinds.includes("EntityQuery") ||
              kinds.includes("FilterCondition")
            ) {
              return (
                // Its rows join the section grid; the builder itself spans both columns.
                <div
                  key={input.name}
                  className={css({ display: "contents" })}
                  data-row
                >
                  {fieldFor(document, step, input)}
                </div>
              );
            }
            const label =
              inputLabels[`${step.actionDefinitionId}.${input.name}`] ??
              input.label;
            // Free text is a wide control: its label above, the field across the panel (J3 D1).
            if (isFreeText(input)) {
              return (
                <div
                  key={input.name}
                  data-row
                  className={css({
                    gridColumn: "1 / -1",
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.5",
                  })}
                >
                  <Tooltip
                    content={`${label} · ${inputHover(input, kinds)}`}
                    position="top"
                  >
                    <span className={cx(keyStyle, keyHoverStyle)}>{label}</span>
                  </Tooltip>
                  {fieldFor(document, step, input)}
                </div>
              );
            }
            return (
              <PropertyRow
                key={input.name}
                label={label}
                hover={inputHover(input, kinds)}
                required={
                  input.required &&
                  !input.hasDefault &&
                  !input.rule?.startsWith("At least")
                }
                invalid={validation.mockFields.has(
                  `${step.stepId}.${input.name}`,
                )}
              >
                {fieldFor(document, step, input)}
              </PropertyRow>
            );
          })}
        </Section>
      ) : null}
      {showFull && entry.outputs.length > 0 ? (
        <Section title="Outputs">
          {entry.outputs.map((output) => (
            <PropertyRow
              key={output.name}
              label={output.label}
              hover={outputKind(output.name)}
            >
              <UsedBy
                match={(source) =>
                  source.kind === "step-output" &&
                  source.stepId === step.stepId &&
                  source.outputName === output.name
                }
              />
            </PropertyRow>
          ))}
        </Section>
      ) : null}
      <Paths
        stepId={step.stepId}
        ports={entry.ports ?? [{ outputName: "next", label: "Next" }]}
      />
      <Checks stepId={step.stepId} />
    </>
  );
};

const overInput: InputView = {
  name: "over",
  label: "List",
  array: true,
  required: true,
  hasDefault: false,
  kinds: null,
};

const ForEachPanel = ({ step }: { step: DraftForEachStep }) => {
  const { document, setDocument, ui, setUi } = useEditor();
  const anchorRef = useRef<HTMLDivElement>(null);
  const open =
    ui.openField?.stepId === step.stepId && ui.openField.inputName === "over";
  const itemShape = getItemShape(document, step.stepId);
  const over = step.over
    ? describeSource(document, step.over, step.stepId)
    : null;

  // Any list fits: For each takes an array of any kind.
  const anyListInput: InputView = { ...overInput, kinds: allPayloadKinds };

  // Grouped by step, so each option is just the output's name and nothing gets cut off.
  const collectOptions = step.steps.flatMap((child) =>
    child.kind === "action"
      ? [
          {
            id: child.stepId,
            label: stepLabel(child),
            items: (
              getCatalogEntry(child.actionDefinitionId)?.outputs ?? []
            ).map((output) => ({
              value: `${child.stepId}.${output.name}`,
              text: output.label,
            })),
          },
        ].filter((group) => group.items.length > 0)
      : [],
  );

  return (
    <>
      <PanelHeader
        icon="rotate"
        type={step.description || "For each"}
        subtitle={
          step.description.startsWith("For each ")
            ? `Runs its steps once per ${step.description.slice("For each ".length)}`
            : "Runs its steps once per item of a list"
        }
        stepId={step.stepId}
      />
      <Section title="Inputs">
        <PropertyRow label="List" hover="List of any kind · required" required>
          <div
            ref={anchorRef}
            className={css({
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: "1.5",
            })}
          >
            <SourceSelectTrigger
              source={step.over}
              stepId={step.stepId}
              placeholder={!(step.over && over)}
              onClick={() =>
                setUi((current) => ({
                  ...current,
                  openField: {
                    stepId: step.stepId,
                    inputName: "over",
                    mode: "menu",
                  },
                }))
              }
            >
              {step.over && over
                ? step.over.kind === "item"
                  ? `${over.owner} › ${over.label}`
                  : step.over.kind === "flow-input"
                    ? over.label
                    : over.owner
                : "Choose a list"}
            </SourceSelectTrigger>
          </div>
          {open ? (
            <SourceMenu
              anchor={anchorRef}
              stepId={step.stepId}
              input={anyListInput}
              entry={forEachEntry}
              listsOnly
              position="bottom-start"
              onClose={() =>
                setUi((current) => ({ ...current, openField: null }))
              }
              onPick={(source) => {
                setDocument((current) =>
                  updateStep(current, step.stepId, (candidate) => ({
                    ...candidate,
                    over: source,
                  })),
                );
                setUi((current) => ({ ...current, openField: null }));
              }}
            />
          ) : null}
        </PropertyRow>
        {showFull ? (
          <PropertyRow
            label="Item"
            hover={
              itemShape
                ? kindLabel(itemShape.payloadKind)
                : "Set the list first"
            }
          >
            <span
              className={css({
                textStyle: "sm",
                color: "neutral.fg.heading",
              })}
            >
              {itemName(document, step.stepId)}
            </span>
          </PropertyRow>
        ) : null}
      </Section>
      {showFull ? (
        <Section title="Outputs">
          <PropertyRow
            label="Collect"
            hover="The engine collects one output from every item into a list"
            required
          >
            <Select
              size="sm"
              items={collectOptions}
              value={
                step.collect
                  ? `${step.collect.stepId}.${step.collect.outputName}`
                  : null
              }
              placeholder={
                collectOptions.length === 0
                  ? "Add a step inside first"
                  : "Choose an output"
              }
              onChange={(value) => {
                const [childId, outputName] = (value ?? "").split(".");
                setDocument((current) =>
                  updateStep(current, step.stepId, (candidate) => ({
                    ...candidate,
                    collect:
                      childId && outputName
                        ? {
                            stepId: childId,
                            outputName,
                            as: `collected${outputName.charAt(0).toUpperCase()}${outputName.slice(1)}`,
                          }
                        : undefined,
                  })),
                );
              }}
            />
            {step.collect ? (
              <div>
                <SourceChip
                  icon={nodeLook(document, step.collect.stepId).icon}
                  onClick={() =>
                    setUi((current) => ({
                      ...current,
                      selectedId: step.collect?.stepId ?? null,
                    }))
                  }
                >
                  {(() => {
                    const collected = findStep(
                      document,
                      step.collect.stepId,
                    )?.step;
                    return collected ? stepLabel(collected) : "";
                  })()}
                </SourceChip>
              </div>
            ) : null}
            {step.collect ? (
              <UsedBy
                quiet
                match={(source) =>
                  source.kind === "step-output" &&
                  source.stepId === step.stepId &&
                  source.outputName === step.collect?.as
                }
              />
            ) : null}
          </PropertyRow>
        </Section>
      ) : null}
      <Paths
        stepId={step.stepId}
        ports={[{ outputName: "next", label: "Next" }]}
      />
      <Checks stepId={step.stepId} />
    </>
  );
};

const inputKindChoices = [
  { value: "Text", text: "Text" },
  { value: "Number", text: "Number" },
  { value: "Date", text: "Date" },
  { value: "DateTime", text: "Date and time" },
  { value: "Duration", text: "Duration" },
  { value: "Boolean", text: "Yes or no" },
  { value: "EntityId", text: "Entity" },
  { value: "VersionedUrl", text: "Entity type" },
  { value: "EntityId[]", text: "List of entities" },
  { value: "Text[]", text: "List of text" },
];

const nextInputNumber = (document: EditorDocument) => {
  let index = document.inputs.length + 1;
  while (document.inputs.some((input) => input.name === `input${index}`)) {
    index += 1;
  }
  return index;
};

/** One flow input: its fields stacked, Remove top right on hover. */
const inputBlockStyle = css({
  position: "relative",
  display: "grid",
  gridTemplateColumns: "minmax(88px, min(30%, 120px)) minmax(0, 1fr)",
  columnGap: "2",
  rowGap: "2",
  alignItems: "baseline",
  "& > :not([data-row])": { gridColumn: "1 / -1" },
  "&:not(:hover):not(:focus-within) [data-row-action]": { opacity: "[0]" },
});

const rowActionStyle = css({
  position: "absolute",
  right: "[0]",
  top: "[-4px]",
  zIndex: "[1]",
  transition: "[opacity 0.15s ease]",
});

const tableHeadStyle = css({ textStyle: "xs", color: "neutral.fg.subtle" });

const RunFormFields = () => {
  const { document, setDocument } = useEditor();

  const updateInput = (
    name: string,
    change: Partial<EditorDocument["inputs"][number]>,
  ) =>
    setDocument((current) => ({
      ...current,
      inputs: current.inputs.map((input) =>
        input.name === name ? { ...input, ...change } : input,
      ),
    }));

  const setDefault = (name: string, value: unknown) =>
    setDocument((current) => {
      const inputDefaults = { ...current.inputDefaults };
      if (value === null || value === undefined) {
        delete inputDefaults[name];
      } else {
        inputDefaults[name] = value;
      }
      return { ...current, inputDefaults };
    });

  const addInput = () =>
    setDocument((current) => {
      const index = nextInputNumber(current);
      return {
        ...current,
        inputs: [
          ...current.inputs,
          {
            name: `input${index}`,
            label: `Input ${index}`,
            payloadKind: "Text",
            array: false,
            required: true,
          },
        ],
      };
    });

  // Figma J4: Start lists its inputs as a Name | Type table; the per-input editor (Default value, Add input) is `?full`.
  if (inScreenState && !showFull) {
    const typeChoices = (input: EditorDocument["inputs"][number]) => {
      const entityType = findEntityType(
        document.inputEntityTypes[input.name] ?? "",
      );
      return inputKindChoices.map((choice) =>
        choice.value === (input.array ? "EntityId[]" : "EntityId") && entityType
          ? {
              ...choice,
              text: input.array
                ? `List of ${entityType.title}`
                : entityType.title,
            }
          : choice,
      );
    };
    return (
      <Section title="Inputs">
        <div className={css({ display: "contents" })} data-row>
          <span className={tableHeadStyle}>Name</span>
          <span className={tableHeadStyle}>Type</span>
        </div>
        {document.inputs.map((input) => (
          <PropertyRow key={input.name} label={input.label ?? input.name}>
            <Select
              size="sm"
              aria-label={`${input.label ?? input.name} type`}
              items={typeChoices(input)}
              value={`${input.payloadKind}${input.array ? "[]" : ""}`}
              onChange={(value) => {
                if (!value) {
                  return;
                }
                updateInput(input.name, {
                  payloadKind: value.replace("[]", "") as PayloadKind,
                  array: value.endsWith("[]"),
                });
                setDefault(input.name, null);
              }}
            />
          </PropertyRow>
        ))}
      </Section>
    );
  }

  return (
    <Section title="Inputs">
      {document.inputs.length === 0 ? (
        <span className={mutedTextStyle}>
          No inputs. Add one when a step needs a value nothing earlier gives.
        </span>
      ) : null}
      {document.inputs.map((input, index) => (
        <div
          key={input.name}
          className={cx(
            inputBlockStyle,
            index > 0
              ? css({
                  paddingTop: "2",
                  borderTopWidth: "thin",
                  borderTopStyle: "solid",
                  borderTopColor: "neutral.bd.subtle",
                })
              : undefined,
          )}
        >
          <span className={rowActionStyle} data-row-action>
            <Button
              size="xs"
              variant="ghost"
              iconName="trash"
              aria-label={`Remove ${input.label ?? input.name}`}
              tooltip="Remove"
              onClick={() =>
                setDocument((current) => ({
                  ...current,
                  inputs: current.inputs.filter(
                    (other) => other.name !== input.name,
                  ),
                }))
              }
            />
          </span>
          <PropertyRow label="Name">
            <TextInput
              size="sm"
              value={input.label ?? ""}
              aria-label="Input name"
              onChange={(label) => updateInput(input.name, { label })}
            />
          </PropertyRow>
          <PropertyRow label="Type">
            <Select
              size="sm"
              aria-label="Input type"
              items={inputKindChoices}
              value={`${input.payloadKind}${input.array ? "[]" : ""}`}
              onChange={(value) => {
                if (!value) {
                  return;
                }
                const array = value.endsWith("[]");
                updateInput(input.name, {
                  payloadKind: value.replace("[]", "") as PayloadKind,
                  array,
                });
                // A default of the old type would not fit the new one.
                setDefault(input.name, null);
              }}
            />
          </PropertyRow>
          {input.payloadKind === "EntityId" ? (
            <PropertyRow
              label="Entity type"
              optional
              hover="Flow inputs have no entity type in the engine. Kept in the prototype's mock layer so the run form can filter its picker."
            >
              <Select
                size="sm"
                items={mockEntityTypes.map((type) => ({
                  value: type.baseUrl,
                  text: type.title,
                }))}
                value={document.inputEntityTypes[input.name] ?? null}
                placeholder="Any entity type"
                onChange={(value) =>
                  setDocument((current) => ({
                    ...current,
                    inputEntityTypes: value
                      ? { ...current.inputEntityTypes, [input.name]: value }
                      : Object.fromEntries(
                          Object.entries(current.inputEntityTypes).filter(
                            ([name]) => name !== input.name,
                          ),
                        ),
                  }))
                }
              />
            </PropertyRow>
          ) : null}
          {input.array && input.payloadKind !== "EntityId" ? null : (
            <PropertyRow
              label="Default value"
              optional
              hover="Mock: what the run form fills in. The engine's flow inputs have no default."
            >
              {input.array ? (
                <Select
                  size="sm"
                  multiple
                  searchable
                  renderSelectedAll={firstAndMore(
                    (value) =>
                      mockEntities.find((entity) => entity.entityId === value)
                        ?.label ?? value,
                  )}
                  aria-label={`${input.label ?? input.name} default value`}
                  items={mockEntities
                    .filter(
                      (entity) =>
                        !document.inputEntityTypes[input.name] ||
                        entity.entityTypeBaseUrl ===
                          document.inputEntityTypes[input.name],
                    )
                    .map((entity) => ({
                      value: entity.entityId as string,
                      text: entity.label,
                    }))}
                  value={
                    Array.isArray(document.inputDefaults?.[input.name])
                      ? (document.inputDefaults[input.name] as string[])
                      : []
                  }
                  placeholder="No default"
                  onChange={(value) => setDefault(input.name, value)}
                />
              ) : (
                <TypedValue
                  kind={input.payloadKind}
                  label={`${input.label ?? input.name} default value`}
                  allowRelative
                  entityTypeBaseUrl={document.inputEntityTypes[input.name]}
                  value={document.inputDefaults?.[input.name]}
                  placeholder={
                    input.payloadKind === "Text" ? "No default" : undefined
                  }
                  onChange={(value) => setDefault(input.name, value)}
                />
              )}
            </PropertyRow>
          )}
          {usersOf(
            document,
            (source) =>
              source.kind === "flow-input" && source.inputName === input.name,
          ).length > 0 ? (
            <PropertyRow label="Used by">
              <UsedBy
                quiet
                match={(source) =>
                  source.kind === "flow-input" &&
                  source.inputName === input.name
                }
              />
            </PropertyRow>
          ) : null}
        </div>
      ))}
      <div>
        <Button size="sm" variant="subtle" iconName="plus" onClick={addInput}>
          Add input
        </Button>
      </div>
    </Section>
  );
};

const timezones = ["Europe/London", "America/New_York", "UTC"];

/** Recurring schedule's settings, backed by the engine's real `CronScheduleSpec`. */
const ScheduleSettings = ({ trigger }: { trigger: TriggerNode }) => {
  const { setDocument } = useEditor();
  const spec = trigger.settings.spec ?? {
    type: "cron" as const,
    cronExpression: "0 9 1 * *",
    timezone: "Europe/London",
  };
  const parts = fromCron(spec.cronExpression);
  const setSpec = (next: typeof spec) =>
    setDocument((document) =>
      updateTrigger(document, trigger.id, (current) => ({
        ...current,
        settings: { ...current.settings, spec: next },
      })),
    );
  const setParts = (change: Partial<typeof parts>) =>
    setSpec({ ...spec, cronExpression: toCron({ ...parts, ...change }) });

  return (
    <Section title="Settings">
      <PropertyRow label="Repeat" required>
        <SegmentedControl<Repeat>
          size="sm"
          items={[
            { value: "day", label: "Daily" },
            { value: "week", label: "Weekly" },
            { value: "month", label: "Monthly" },
          ]}
          value={parts.repeat}
          onChange={(repeat) => setParts({ repeat })}
        />
      </PropertyRow>
      {parts.repeat === "month" ? (
        <PropertyRow label="On day">
          <NumberInput
            size="sm"
            value={parts.dayOfMonth}
            onChange={(day) =>
              setParts({ dayOfMonth: Math.min(28, Math.max(1, day ?? 1)) })
            }
            width="fullWidth"
          />
        </PropertyRow>
      ) : null}
      {parts.repeat === "week" ? (
        <PropertyRow label="On">
          <Select
            size="sm"
            items={weekdays.map((day, index) => ({
              value: String(index),
              text: day,
            }))}
            value={String(parts.dayOfWeek)}
            onChange={(day) => setParts({ dayOfWeek: Number(day ?? 1) })}
          />
        </PropertyRow>
      ) : null}
      <PropertyRow label="At" required>
        <TimeField
          label="At"
          value={parts.time}
          onChange={(time) => setParts({ time })}
        />
      </PropertyRow>
      <PropertyRow label="Time zone" required>
        <Select
          size="sm"
          items={timezones.map((zone) => ({ value: zone, text: zone }))}
          value={spec.timezone ?? "UTC"}
          onChange={(timezone) =>
            setSpec({ ...spec, timezone: timezone ?? undefined })
          }
        />
      </PropertyRow>
      <div className={mutedTextStyle}>
        {describeCron(spec)}
        {spec.timezone ? ` (${spec.timezone})` : ""}
      </div>
    </Section>
  );
};

/**
 * A trigger's condition: the condition builder on the watched type's properties (field kinds v2, F10; the draft PRD
 * types it as long text). Nothing runs before a trigger, so its values are typed or picked, never variables.
 */
const TriggerCondition = ({
  trigger,
  entityTypeBaseUrl,
}: {
  trigger: TriggerNode;
  entityTypeBaseUrl: string;
}) => {
  const entry = getCatalogEntry("if")!;
  // The builder edits a step's input; the trigger stands in as a step with no inputs, its draft keyed by its id.
  const step = {
    kind: "action",
    stepId: trigger.id,
    actionDefinitionId: "if",
    inputs: {},
  } as unknown as DraftActionStep;
  const input: InputView = {
    name: "condition",
    label: "Condition",
    array: false,
    required: false,
    hasDefault: false,
    kinds: ["FilterCondition"],
  };
  return (
    <QueryField
      step={step}
      input={input}
      entry={entry}
      mode="condition"
      typeHint={entityTypeBaseUrl}
      allowVariables={false}
    />
  );
};

/** MOCK: Entity created / updated settings, from the draft PRD. */
const whenItems = [
  { value: "entityCreated", text: "Created" },
  { value: "entityUpdated", text: "Updated" },
  { value: "entityChanged", text: "Created or updated" },
];

const EntitySettings = ({ trigger }: { trigger: TriggerNode }) => {
  const { setDocument } = useEditor();
  const set = (change: Partial<TriggerNode["settings"]>) =>
    setDocument((document) =>
      updateTrigger(document, trigger.id, (current) => ({
        ...current,
        settings: { ...current.settings, ...change },
      })),
    );
  const type = findEntityType(trigger.settings.entityTypeBaseUrl);
  return (
    <Section title="Settings">
      <PropertyRow
        label="Entity type"
        required
        hover="The kind of entity to watch"
      >
        <Select
          size="sm"
          prefix={type ? { iconName: "cube" } : undefined}
          items={mockEntityTypes.map((candidate) => ({
            value: candidate.baseUrl,
            text: candidate.title,
          }))}
          value={trigger.settings.entityTypeBaseUrl ?? null}
          placeholder="Choose a type"
          onChange={(value) =>
            set({
              entityTypeBaseUrl: value ?? undefined,
              propertiesToWatch: [],
            })
          }
        />
      </PropertyRow>
      <PropertyRow label="When" hover="Which changes start a run">
        <Select
          size="sm"
          items={whenItems}
          value={trigger.kind}
          onChange={(kind) =>
            kind
              ? setDocument((document) =>
                  updateTrigger(document, trigger.id, (current) => ({
                    ...current,
                    kind: kind as TriggerKind,
                  })),
                )
              : undefined
          }
        />
      </PropertyRow>
      {trigger.kind !== "entityCreated" && !(inScreenState && !showFull) ? (
        <PropertyRow
          label="Properties to watch"
          wrapLabel
          hover="Only start when one of these changes. Empty means any change."
        >
          <Select
            size="sm"
            multiple
            items={(type?.properties ?? []).map((property) => ({
              value: property.baseUrl,
              text: property.title,
            }))}
            value={trigger.settings.propertiesToWatch ?? []}
            placeholder="Any property"
            onChange={(propertiesToWatch) => set({ propertiesToWatch })}
          />
        </PropertyRow>
      ) : null}
      {inScreenState && !showFull ? null : type ? (
        <TriggerCondition trigger={trigger} entityTypeBaseUrl={type.baseUrl} />
      ) : (
        <PropertyRow
          label="Condition"
          hover="Only start when the entity matches"
        >
          <span className={emptyValueStyle}>Choose an entity type first</span>
        </PropertyRow>
      )}
    </Section>
  );
};

const WebhookSettings = ({ trigger }: { trigger: TriggerNode }) => (
  <Section title="Settings">
    <PropertyRow label="URL" hover="Calls to this address start a run">
      <TextInput
        size="sm"
        value={trigger.settings.webhookUrl ?? ""}
        readonly
        onChange={() => undefined}
      />
    </PropertyRow>
  </Section>
);

/**
 * What a trigger gives each of Start's inputs: one of its fields of the same kind, or a fixed value (editor layer,
 * mocked: the engine has inputs, not triggers).
 */
const InputMapping = ({ trigger }: { trigger: TriggerNode }) => {
  const { document, setDocument } = useEditor();
  const definition = triggerDefinitions[trigger.kind];
  const entityType = findEntityType(trigger.settings.entityTypeBaseUrl);
  const outputLabel = (output: { name: string; label: string }) =>
    output.name === "changedEntities" && entityType
      ? `The ${entityType.title.toLowerCase()} that changed`
      : output.label;
  const setMapping = (
    inputName: string,
    mapping: InputMappingValue | undefined,
  ) =>
    setDocument((current) =>
      updateTrigger(current, trigger.id, (candidate) => {
        const inputMap = { ...candidate.settings.inputMap };
        if (mapping) {
          inputMap[inputName] = mapping;
        } else {
          delete inputMap[inputName];
        }
        return { ...candidate, settings: { ...candidate.settings, inputMap } };
      }),
    );
  return (
    <Section title="Flow inputs">
      {document.inputs.length === 0 ? (
        <span className={mutedTextStyle}>No flow inputs yet.</span>
      ) : null}
      {document.inputs.map((input) => {
        const fields = definition.outputs.filter(
          (output) =>
            output.payloadKind === input.payloadKind &&
            output.array === input.array,
        );
        const mapping = trigger.settings.inputMap?.[input.name];
        const choice =
          mapping?.kind === "field"
            ? `field:${mapping.output}`
            : mapping?.kind === "fixed"
              ? "fixed"
              : null;
        const mapped =
          mapping?.kind === "field"
            ? fields.find((output) => output.name === mapping.output)
            : undefined;
        // With no trigger field to take, the only choice is a value, so show the value field alone (Figma J4 A2).
        const valueOnly = fields.length === 0 && !input.array;
        return (
          <PropertyRow
            key={input.name}
            label={input.label ?? input.name}
            hover={kindLabel(input.payloadKind, input.array)}
            required={input.required}
          >
            {mapped ? (
              <SourceChip
                icon={definition.icon}
                // Figma J4 A2 draws the chip with no ×; clearing it is `?full`.
                onRemove={
                  inScreenState && !showFull
                    ? undefined
                    : () => setMapping(input.name, undefined)
                }
              >
                {outputLabel(mapped)}
              </SourceChip>
            ) : valueOnly ? null : (
              <Select
                size="sm"
                items={[
                  ...fields.map((output) => ({
                    value: `field:${output.name}`,
                    text: outputLabel(output),
                  })),
                  { value: "fixed", text: "Fixed value" },
                ]}
                value={choice}
                placeholder={
                  fields.length === 0 ? "Fixed value" : "Choose a field"
                }
                onChange={(value) =>
                  setMapping(
                    input.name,
                    value === "fixed"
                      ? { kind: "fixed", value: null }
                      : value
                        ? {
                            kind: "field",
                            output: value.slice("field:".length),
                          }
                        : undefined,
                  )
                }
              />
            )}
            {(mapping?.kind === "fixed" || valueOnly) && !input.array ? (
              <TypedValue
                kind={input.payloadKind}
                compact
                label={`${input.label ?? input.name} fixed value`}
                allowRelative
                entityTypeBaseUrl={document.inputEntityTypes[input.name]}
                value={
                  mapping?.kind === "fixed"
                    ? (mapping.value ?? undefined)
                    : undefined
                }
                onChange={(value) =>
                  setMapping(input.name, { kind: "fixed", value })
                }
              />
            ) : null}
          </PropertyRow>
        );
      })}
    </Section>
  );
};

/** A "Started by" row's value: the trigger's tile and name, as a quiet row; clicking it opens the trigger's panel. */
const startedByRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  minHeight: "[32px]",
  paddingX: "1",
  borderRadius: "md",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.body",
  textAlign: "left",
  cursor: "pointer",
  minWidth: "[0]",
  _hover: { backgroundColor: "neutral.bg.surface.active" },
});

const startedByIconStyle = css({
  display: "inline-flex",
  flexShrink: 0,
  color: "neutral.fg.muted",
});

const addTriggerStyle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "blue.fg.link",
  cursor: "pointer",
  _hover: { textDecoration: "underline" },
});

/** What starts the flow, listed on Start (J4 A1): one row per trigger, and "Add trigger", a menu that opens a form. */
const StartedBy = () => {
  const { document, setDocument, setUi } = useEditor();
  const open = (triggerId: string) =>
    setUi((ui) => ({
      ...ui,
      selectedId: START_ID,
      triggerId,
      openField: null,
    }));
  return (
    <Section title="Started by">
      {document.triggers.map((trigger) => {
        const definition = triggerDefinitions[trigger.kind];
        return (
          <PropertyRow
            key={trigger.id}
            label={trigger.kind === "schedule" ? "Schedule" : "Trigger"}
          >
            <button
              type="button"
              className={startedByRowStyle}
              onClick={() => open(trigger.id)}
            >
              <span className={startedByIconStyle}>
                <Icon name={definition.icon} size="sm" />
              </span>
              <span>{trigger.description || definition.title}</span>
            </button>
          </PropertyRow>
        );
      })}
      <div>
        <Menu
          position="bottom-start"
          items={[
            {
              id: "triggers",
              label: "",
              items: addableTriggerKinds.map((kind) => ({
                id: kind,
                text: triggerDefinitions[kind].title,
                icon: triggerDefinitions[kind].icon,
                suffix:
                  showDebug && triggerDefinitions[kind].mock ? (
                    <OriginMark
                      label="mock"
                      hover="No such trigger on main yet."
                    />
                  ) : undefined,
                onClick: () => {
                  const { document: next, triggerId } = addTrigger(
                    document,
                    kind,
                  );
                  setDocument(() => next);
                  open(triggerId);
                },
              })),
            },
          ]}
          trigger={
            <button type="button" className={addTriggerStyle}>
              Add trigger
            </button>
          }
        />
      </div>
    </Section>
  );
};

/** Start: the flow's inputs, which the Run button's form and every trigger fill. */
const StartPanel = () => {
  const { document, setDocument } = useEditor();
  return (
    <>
      <div className={panelHeaderStyle}>
        <HeaderTitle icon="play">
          <span className={typeLineStyle}>Start</span>
        </HeaderTitle>
        <DescriptionInput
          label="Start description"
          value={document.startDescription}
          onChange={(next) =>
            setDocument((current) => ({ ...current, startDescription: next }))
          }
        />
      </div>
      <RunFormFields />
      <StartedBy />
    </>
  );
};

/** A trigger node: what starts the run, its settings, and what it gives Start's inputs. */
const TriggerPanel = ({ trigger }: { trigger: TriggerNode }) => {
  const definition = triggerDefinitions[trigger.kind];
  return (
    <>
      <PanelHeader
        icon={definition.icon}
        type={trigger.description || definition.title}
        subtitle="Trigger"
        trigger={trigger}
      />
      {trigger.kind === "schedule" ? (
        <ScheduleSettings trigger={trigger} />
      ) : null}
      {isEntityTrigger(trigger.kind) ? (
        <EntitySettings trigger={trigger} />
      ) : null}
      {trigger.kind === "webhook" ? (
        <WebhookSettings trigger={trigger} />
      ) : null}
      <InputMapping trigger={trigger} />
    </>
  );
};

export const PropertiesPanel = () => {
  const { document, ui } = useEditor();
  // A trigger opens from Start's "Started by" list: Start stays selected, the panel shows the trigger (J4 A2).
  const trigger =
    ui.selectedId === START_ID && ui.triggerId
      ? findTrigger(document, ui.triggerId)
      : null;
  const found =
    !ui.selectedId || ui.selectedId === START_ID
      ? null
      : findStep(document, ui.selectedId);
  return (
    <aside className={panelStyle} aria-label="Properties">
      <OverlayScrollArea>
        <div className={panelBodyStyle}>
          {!ui.selectedId ? (
            // J4 B1: with nothing selected, the panel names the flow.
            <div className={panelHeaderStyle}>
              <span className={typeLineStyle}>{document.name}</span>
              <span className={descriptionInputStyle}>Nothing selected</span>
            </div>
          ) : trigger ? (
            <TriggerPanel key={trigger.id} trigger={trigger} />
          ) : ui.selectedId === START_ID ? (
            <StartPanel />
          ) : found?.step.kind === "action" ? (
            <ActionPanel key={found.step.stepId} step={found.step} />
          ) : found?.step.kind === "for-each" ? (
            <ForEachPanel key={found.step.stepId} step={found.step} />
          ) : null}
        </div>
      </OverlayScrollArea>
    </aside>
  );
};

export { isMockPayloadKind };

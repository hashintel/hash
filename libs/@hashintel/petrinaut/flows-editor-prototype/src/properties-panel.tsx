import { useRef } from "react";

import {
  Button,
  Chip,
  NumberInput,
  SegmentedControl,
  Select,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { forEachEntry, getCatalogEntry, type InputView } from "./catalog";
import {
  START_ID,
  type DraftActionStep,
  type DraftForEachStep,
  type EditorDocument,
  findStep,
  stepLabel,
  findTrigger,
  removeStep,
  removeTrigger,
  updateStep,
  updateTrigger,
  usersOf,
} from "./document";
import { useEditor } from "./editor-context";
import {
  allPayloadKinds,
  type PayloadKind,
  type StepInputSource,
} from "./engine";
import {
  entityTypeOf,
  isFreeText,
  kindHover,
  ListField,
  MentionField,
  PatchField,
  PropertyField,
  QueryField,
  ValueField,
} from "./fields";
import { isMockPayloadKind } from "./mock-action-definitions";
import { findEntityType, mockEntityTypes } from "./mock-graph";
import {
  describeCron,
  fromCron,
  type Repeat,
  toCron,
  type InputMapping as InputMappingValue,
  type TriggerNode,
  triggerDefinitions,
  weekdays,
} from "./mock-triggers";
import {
  acceptedKinds,
  describeSource,
  getItemShape,
  getSourceShape,
} from "./shapes";
import { SourceMenu } from "./source-menu";
import {
  IconTile,
  kindLabel,
  mutedTextStyle,
  OriginMark,
  panelHeaderStyle,
  PropertyRow,
  Section,
  typeLineStyle,
} from "./ui";

const panelStyle = css({
  position: "absolute",
  top: "[12px]",
  right: "[12px]",
  bottom: "[12px]",
  width: "[380px]",
  backgroundColor: "neutral.s00",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.s40",
  borderRadius: "lg",
  boxShadow: "[0 3px 11px rgba(0, 0, 0, 0.08)]",
  overflowY: "auto",
  zIndex: "[5]",
});

/** "Used by" chips: which steps read a value (D26 A, folded into D27 A). */
const UsedBy = ({ match }: { match: (source: StepInputSource) => boolean }) => {
  const { document, setUi } = useEditor();
  const users = usersOf(document, match);
  if (users.length === 0) {
    return <span className={mutedTextStyle}>Not used yet</span>;
  }
  return (
    <div className={css({ display: "flex", flexWrap: "wrap", gap: "1" })}>
      {users.map((userId) => {
        const user = findStep(document, userId)?.step;
        return (
          <Chip
            key={userId}
            size="sm"
            color="grey"
            onClick={() =>
              setUi((ui) => ({ ...ui, selectedId: userId, openField: null }))
            }
          >
            {user ? stepLabel(user) : userId}
          </Chip>
        );
      })}
    </div>
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
              <span className={mutedTextStyle}>Ends here</span>
            ) : (
              <div
                className={css({ display: "flex", flexWrap: "wrap", gap: "1" })}
              >
                {targets.map((wire) => (
                  <Chip
                    key={wire.id}
                    size="sm"
                    color="grey"
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
                  </Chip>
                ))}
              </div>
            )}
          </PropertyRow>
        );
      })}
    </Section>
  );
};

/** Raw engine diagnostics, for engineers only: behind `?debug`, never in the default UI. */
const showEngineChecks = new URLSearchParams(globalThis.location.search).has(
  "debug",
);

const Checks = ({ stepId }: { stepId: string }) => {
  const { validation } = useEditor();
  if (!showEngineChecks) {
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
            paddingX: "4",
            paddingY: "1",
            fontSize: "xs",
            color: problem.severity === "error" ? "red.s100" : "neutral.s100",
          })}
        >
          {problem.message}
        </div>
      ))}
    </Section>
  );
};

const DescriptionInput = ({
  stepId,
  value,
}: {
  stepId: string;
  value: string;
}) => {
  const { setDocument } = useEditor();
  return (
    <TextInput
      value={value}
      variant="subtle"
      size="sm"
      placeholder="Add a description…"
      aria-label="Step description"
      onChange={(next) =>
        setDocument((document) =>
          updateStep(document, stepId, (step) => ({
            ...step,
            description: next,
          })),
        )
      }
    />
  );
};

const PanelHeader = ({
  icon,
  tone,
  type,
  origin,
  stepId,
  description,
  trigger,
}: {
  icon: Parameters<typeof IconTile>[0]["icon"];
  tone: "green" | "orange" | "neutral" | "blue";
  type: string;
  origin?: React.ReactNode;
  stepId?: string;
  description?: string;
  /** A trigger node: its description and delete act on the trigger. */
  trigger?: TriggerNode;
}) => {
  const { setDocument, setUi } = useEditor();
  if (trigger) {
    return (
      <div className={panelHeaderStyle}>
        <IconTile icon={icon} tone={tone} />
        <div
          className={css({
            flex: "1",
            minWidth: "[0]",
            display: "flex",
            flexDirection: "column",
            gap: "1",
          })}
        >
          <div
            className={css({ display: "flex", alignItems: "center", gap: "2" })}
          >
            <span className={typeLineStyle}>{type}</span>
            {origin}
          </div>
          <TextInput
            value={trigger.description}
            variant="subtle"
            size="sm"
            placeholder="Add a description…"
            aria-label="Trigger description"
            onChange={(next) =>
              setDocument((document) =>
                updateTrigger(document, trigger.id, (current) => ({
                  ...current,
                  description: next,
                })),
              )
            }
          />
        </div>
        {trigger.id === START_ID ? null : (
          <Button
            size="sm"
            variant="ghost"
            iconName="trash"
            aria-label="Delete trigger"
            tooltip="Delete trigger"
            onClick={() => {
              setDocument((document) => removeTrigger(document, trigger.id));
              setUi((ui) => ({ ...ui, selectedId: null }));
            }}
          />
        )}
      </div>
    );
  }
  return (
    <div className={panelHeaderStyle}>
      <IconTile icon={icon} tone={tone} />
      <div
        className={css({
          flex: "1",
          minWidth: "[0]",
          display: "flex",
          flexDirection: "column",
          gap: "1",
        })}
      >
        <div
          className={css({ display: "flex", alignItems: "center", gap: "2" })}
        >
          <span className={typeLineStyle}>{type}</span>
          {origin}
        </div>
        {stepId && description !== undefined ? (
          <DescriptionInput stepId={stepId} value={description} />
        ) : null}
      </div>
      {stepId ? (
        <Button
          size="sm"
          variant="ghost"
          iconName="trash"
          aria-label="Delete step"
          tooltip="Delete step"
          onClick={() => {
            setDocument((document) => removeStep(document, stepId));
            setUi((ui) => ({ ...ui, selectedId: null }));
          }}
        />
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
    return <ListField {...props} />;
  }
  if (isFreeText(input)) {
    return <MentionField {...props} />;
  }
  return <ValueField {...props} />;
};

const ActionPanel = ({ step }: { step: DraftActionStep }) => {
  const { document, validation } = useEditor();
  const entry = getCatalogEntry(step.actionDefinitionId);
  if (!entry) {
    return null;
  }
  const origin =
    entry.origin.kind === "open-pr" ? (
      <OriginMark
        label={`#${entry.origin.pr}`}
        hover={`Defined in open PR #${entry.origin.pr}, not on main yet`}
      />
    ) : entry.origin.kind === "mock" ? (
      <OriginMark label="mock" hover={entry.origin.why} />
    ) : null;

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
        tone={entry.tone}
        type={entry.title}
        origin={origin}
        stepId={step.stepId}
        description={step.description}
      />
      {entry.inputs.length > 0 ? (
        <Section title="Inputs">
          {entry.inputs.map((input) => {
            const kinds = acceptedKinds(document, step.stepId, input, entry);
            // Query builders stack: key above, builder below (Journey 3).
            if (
              kinds.includes("EntityQuery") ||
              kinds.includes("FilterCondition")
            ) {
              return (
                <div key={input.name}>{fieldFor(document, step, input)}</div>
              );
            }
            return (
              <PropertyRow
                key={input.name}
                label={input.label}
                hover={`${kindHover(input, kinds)}${input.rule ? ` · ${input.rule}` : ""}${input.description ? ` — ${input.description}` : ""}`}
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
      {entry.outputs.length > 0 ? (
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
        tone="green"
        type="For each"
        stepId={step.stepId}
        description={step.description}
      />
      <Section title="Inputs">
        <PropertyRow label="List" hover="List of any kind · required" required>
          <div
            ref={anchorRef}
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "1",
            })}
          >
            {step.over && over ? (
              <Chip
                size="sm"
                color="blue"
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
                removeable={{
                  onRemove: () =>
                    setDocument((current) =>
                      updateStep(current, step.stepId, (candidate) => ({
                        ...candidate,
                        over: undefined,
                      })),
                    ),
                  "aria-label": "Clear",
                }}
              >
                {over.owner === "Start"
                  ? over.label
                  : `${over.owner} › ${over.label}`}
              </Chip>
            ) : (
              <Button
                size="sm"
                variant="subtle"
                iconName="plus"
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
                Choose a list
              </Button>
            )}
          </div>
          {open ? (
            <SourceMenu
              anchor={anchorRef}
              stepId={step.stepId}
              input={anyListInput}
              entry={forEachEntry}
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
        <PropertyRow
          label="Item"
          hover={
            itemShape ? kindLabel(itemShape.payloadKind) : "Set the list first"
          }
        >
          <span
            className={css({
              fontSize: "sm",
              color: "neutral.s110",
              paddingTop: "[6px]",
            })}
          >
            Current item
          </span>
        </PropertyRow>
      </Section>
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
            <span className={mutedTextStyle}>
              {(() => {
                const collected = findStep(document, step.collect.stepId)?.step;
                return collected ? stepLabel(collected) : "";
              })()}
            </span>
          ) : null}
          {step.collect ? (
            <UsedBy
              match={(source) =>
                source.kind === "step-output" &&
                source.stepId === step.stepId &&
                source.outputName === step.collect?.as
              }
            />
          ) : null}
        </PropertyRow>
      </Section>
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
  { value: "Boolean", text: "Yes or no" },
  { value: "EntityId", text: "Entity" },
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

  return (
    <>
      <Section
        title="Flow inputs"
        action={
          <Button size="xs" variant="ghost" iconName="plus" onClick={addInput}>
            Add
          </Button>
        }
      >
        {document.inputs.length === 0 ? (
          <div
            className={css({
              paddingX: "4",
              paddingY: "2",
              fontSize: "sm",
              color: "neutral.s90",
            })}
          >
            No fields. Add one when a step needs a value nothing earlier gives.
          </div>
        ) : null}
        {document.inputs.map((input) => (
          <PropertyRow
            key={input.name}
            label={input.label ?? input.name}
            hover={kindLabel(input.payloadKind, input.array)}
          >
            <div className={css({ display: "flex", gap: "1" })}>
              <div className={css({ flex: "1" })}>
                <TextInput
                  size="sm"
                  value={input.label ?? ""}
                  aria-label="Input name"
                  onChange={(label) => updateInput(input.name, { label })}
                />
              </div>
              <Button
                size="sm"
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
            </div>
            <Select
              size="sm"
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
              }}
            />
            {input.payloadKind === "EntityId" ? (
              <Tooltip content="Flow inputs have no entity type in the engine. Kept in the prototype's mock layer so the run form can filter its picker.">
                <div>
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
                </div>
              </Tooltip>
            ) : null}
            <UsedBy
              match={(source) =>
                source.kind === "flow-input" && source.inputName === input.name
              }
            />
          </PropertyRow>
        ))}
      </Section>
    </>
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
            width="sm"
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
        <TextInput
          type="time"
          size="sm"
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
      <div
        className={css({
          paddingX: "4",
          paddingTop: "1",
          fontSize: "sm",
          color: "neutral.s110",
        })}
      >
        {describeCron(spec)}
        {spec.timezone ? ` (${spec.timezone})` : ""}
      </div>
    </Section>
  );
};

/** MOCK: Entity created / updated settings, from the draft PRD. */
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
      {trigger.kind === "entityUpdated" ? (
        <PropertyRow
          label="Properties to watch"
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
      <PropertyRow label="Condition" hover="Only start when the entity matches">
        <TextInput
          size="sm"
          value={trigger.settings.condition ?? ""}
          placeholder="Any entity"
          onChange={(condition) => set({ condition })}
        />
      </PropertyRow>
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
    <Section title="Start inputs">
      {document.inputs.length === 0 ? (
        <div
          className={css({
            paddingX: "4",
            paddingY: "2",
            fontSize: "sm",
            color: "neutral.s90",
          })}
        >
          Start has no inputs yet.
        </div>
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
        return (
          <PropertyRow
            key={input.name}
            label={input.label ?? input.name}
            hover={kindLabel(input.payloadKind, input.array)}
            required={input.required}
          >
            <Select
              size="sm"
              items={[
                ...fields.map((output) => ({
                  value: `field:${output.name}`,
                  text: output.label,
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
                      ? { kind: "field", output: value.slice("field:".length) }
                      : undefined,
                )
              }
            />
            {mapping?.kind === "fixed" ? (
              input.payloadKind === "Number" ? (
                <NumberInput
                  size="sm"
                  value={
                    typeof mapping.value === "number" ? mapping.value : null
                  }
                  onChange={(value) =>
                    setMapping(input.name, { kind: "fixed", value })
                  }
                  width="fullWidth"
                />
              ) : (
                <TextInput
                  size="sm"
                  type={input.payloadKind === "Date" ? "date" : "text"}
                  value={typeof mapping.value === "string" ? mapping.value : ""}
                  onChange={(value) =>
                    setMapping(input.name, { kind: "fixed", value })
                  }
                />
              )
            ) : null}
          </PropertyRow>
        );
      })}
    </Section>
  );
};

/** Start: the flow's inputs, which the Run button's form and every trigger fill. */
const StartPanel = () => {
  const { document, setDocument } = useEditor();
  return (
    <>
      <div className={panelHeaderStyle}>
        <IconTile icon="playFilled" tone="neutral" />
        <div
          className={css({
            flex: "1",
            minWidth: "[0]",
            display: "flex",
            flexDirection: "column",
            gap: "1",
          })}
        >
          <span className={typeLineStyle}>Start</span>
          <TextInput
            value={document.startDescription}
            variant="subtle"
            size="sm"
            placeholder="Add a description…"
            aria-label="Start description"
            onChange={(next) =>
              setDocument((current) => ({ ...current, startDescription: next }))
            }
          />
        </div>
      </div>
      <RunFormFields />
      <Paths
        stepId={START_ID}
        ports={[{ outputName: "next", label: "Next" }]}
      />
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
        tone="blue"
        type={definition.title}
        trigger={trigger}
        origin={
          definition.mock ? (
            <OriginMark label="mock" hover="No such trigger on main yet." />
          ) : null
        }
      />
      {trigger.kind === "schedule" ? (
        <ScheduleSettings trigger={trigger} />
      ) : null}
      {trigger.kind === "entityCreated" || trigger.kind === "entityUpdated" ? (
        <EntitySettings trigger={trigger} />
      ) : null}
      {trigger.kind === "webhook" ? (
        <WebhookSettings trigger={trigger} />
      ) : null}
      <InputMapping trigger={trigger} />
      <Paths
        stepId={trigger.id}
        ports={[{ outputName: "next", label: "Next" }]}
      />
    </>
  );
};

export const PropertiesPanel = () => {
  const { document, ui } = useEditor();
  if (!ui.selectedId) {
    return null;
  }
  const trigger = findTrigger(document, ui.selectedId);
  const found = trigger ? null : findStep(document, ui.selectedId);
  return (
    <aside className={panelStyle} aria-label="Properties">
      {ui.selectedId === START_ID ? (
        <StartPanel />
      ) : trigger ? (
        <TriggerPanel key={trigger.id} trigger={trigger} />
      ) : found?.step.kind === "action" ? (
        <ActionPanel key={found.step.stepId} step={found.step} />
      ) : found?.step.kind === "for-each" ? (
        <ForEachPanel key={found.step.stepId} step={found.step} />
      ) : null}
    </aside>
  );
};

export { isMockPayloadKind };

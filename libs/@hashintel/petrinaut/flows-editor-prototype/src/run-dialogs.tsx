import { useRef, useState } from "react";

import {
  Banner,
  Button,
  Dialog,
  NumberInput,
  SegmentedControl,
  Select,
  TextInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useEditor } from "./editor-context";
import { findEntityType, mockEntities, mockEntityTypes } from "./mock-graph";
import {
  describeCron,
  type EntityTriggerDraft,
  fromCron,
  type Repeat,
  type ScheduleDraft,
  toCron,
  weekdays,
} from "./mock-triggers";
import { kindLabel, mutedTextStyle, OriginMark } from "./ui";

import type { FlowInputDefinition } from "./engine";

type Value = string | number | string[] | null;

const labelStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
});

/**
 * One form control per flow input, chosen by its kind, as the legacy run modal does with `flow-input-field.tsx`:
 * pickers for entities, number fields for numbers.
 */
const InputControl = ({
  input,
  value,
  onChange,
}: {
  input: FlowInputDefinition;
  value: Value;
  onChange: (value: Value) => void;
}) => {
  const { document } = useEditor();
  switch (input.payloadKind) {
    case "EntityId": {
      const typeBaseUrl = document.inputEntityTypes[input.name];
      const items = mockEntities
        .filter(
          (entity) => !typeBaseUrl || entity.entityTypeBaseUrl === typeBaseUrl,
        )
        .map((entity) => ({ value: entity.entityId, text: entity.label }));
      return input.array ? (
        <Select
          multiple
          searchable
          items={items}
          value={Array.isArray(value) ? value : []}
          onChange={(next) => onChange(next)}
          placeholder={`Choose ${findEntityType(typeBaseUrl)?.pluralTitle.toLowerCase() ?? "entities"}`}
        />
      ) : (
        <Select
          searchable
          items={items}
          value={typeof value === "string" ? value : null}
          onChange={(next) => onChange(next)}
          placeholder={`Choose ${findEntityType(typeBaseUrl)?.title.toLowerCase() ?? "an entity"}`}
        />
      );
    }
    case "Number":
      return (
        <NumberInput
          value={typeof value === "number" ? value : null}
          onChange={(next) => onChange(next ?? null)}
          width="fullWidth"
        />
      );
    case "Boolean":
      return (
        <Select
          items={[
            { value: "true", text: "Yes" },
            { value: "false", text: "No" },
          ]}
          value={value === "true" || value === "false" ? value : null}
          onChange={(next) => onChange(next)}
          placeholder="Choose"
        />
      );
    case "Date":
      return (
        <TextInput
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(next) => onChange(next)}
        />
      );
    default:
      return (
        <TextInput
          value={typeof value === "string" ? value : ""}
          onChange={(next) => onChange(next)}
          placeholder={input.array ? "Separate values with commas" : undefined}
        />
      );
  }
};

const isFilled = (value: Value | undefined) =>
  Array.isArray(value)
    ? value.length > 0
    : value !== null && value !== undefined && value !== "";

/** The manual run form, generated from the Start inputs. */
export const RunDialog = () => {
  const { document, setUi } = useEditor();
  const [values, setValues] = useState<Record<string, Value>>({});
  const [started, setStarted] = useState(false);
  const close = () => setUi((ui) => ({ ...ui, runOpen: false }));
  const missing = document.inputs.filter(
    (input) => input.required && !isFilled(values[input.name]),
  );

  return (
    <Dialog size="sm" onClose={close} aria-label={`Run ${document.name}`}>
      <Dialog.Header title={`Run ${document.name}`} />
      <Dialog.Body>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "4",
          })}
        >
          {document.inputs.length === 0 ? (
            <span className={css({ fontSize: "sm", color: "neutral.s100" })}>
              This flow takes no inputs.
            </span>
          ) : null}
          {document.inputs.map((input) => (
            <label
              key={input.name}
              className={css({
                display: "flex",
                flexDirection: "column",
                gap: "1",
              })}
            >
              <span className={labelStyle}>
                {input.label ?? input.name}
                {input.required ? null : (
                  <span className={mutedTextStyle}> · optional</span>
                )}
              </span>
              <InputControl
                input={input}
                value={values[input.name] ?? null}
                onChange={(value) =>
                  setValues((current) => ({ ...current, [input.name]: value }))
                }
              />
            </label>
          ))}
          {started ? (
            <Banner tone="neutral" variant="soft" icon>
              <Banner.Title>No backend in this preview</Banner.Title>
              <Banner.Description>
                A run would start now with these inputs. The run view isn’t
                linked from this prototype yet.
              </Banner.Description>
            </Banner>
          ) : null}
        </div>
      </Dialog.Body>
      <Dialog.Footer
        actions={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="solid"
              iconName="play"
              disabled={missing.length > 0}
              tooltip={
                missing.length > 0
                  ? `Fill in ${missing.map((input) => input.label ?? input.name).join(", ")}`
                  : undefined
              }
              onClick={() => setStarted(true)}
            >
              Run
            </Button>
          </>
        }
      />
    </Dialog>
  );
};

const cardStyle = css({
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.s40",
  borderRadius: "lg",
  padding: "4",
  display: "flex",
  flexDirection: "column",
  gap: "3",
});

const cardTitleStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
});

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[120px 1fr]",
  alignItems: "center",
  columnGap: "3",
});

const timezones = ["Europe/London", "America/New_York", "UTC"];

const ScheduleCard = () => {
  const { document, setDocument } = useEditor();
  const schedule = document.triggers.schedule;
  const setSchedule = (next: ScheduleDraft | null) =>
    setDocument((current) => ({
      ...current,
      triggers: { ...current.triggers, schedule: next },
    }));

  if (!schedule) {
    return (
      <div className={cardStyle}>
        <div className={cardTitleStyle}>Schedule</div>
        <div>
          <Button
            size="sm"
            variant="subtle"
            iconName="calendarClock"
            onClick={() =>
              setSchedule({
                spec: {
                  type: "cron",
                  cronExpression: "0 9 1 * *",
                  timezone: "Europe/London",
                },
                inputValues: {},
                enabled: true,
              })
            }
          >
            Add a schedule
          </Button>
        </div>
      </div>
    );
  }

  const parts = fromCron(schedule.spec.cronExpression);
  const setParts = (change: Partial<typeof parts>) => {
    const next = { ...parts, ...change };
    setSchedule({
      ...schedule,
      spec: { ...schedule.spec, cronExpression: toCron(next) },
    });
  };

  return (
    <div className={cardStyle}>
      <div className={cardTitleStyle}>
        Schedule
        <span className={css({ marginLeft: "auto" })}>
          <Button
            size="xs"
            variant="ghost"
            iconName="trash"
            aria-label="Remove schedule"
            tooltip="Remove"
            onClick={() => setSchedule(null)}
          />
        </span>
      </div>
      <div className={rowStyle}>
        <span className={mutedTextStyle}>Repeats</span>
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
      </div>
      {parts.repeat === "month" ? (
        <div className={rowStyle}>
          <span className={mutedTextStyle}>On day</span>
          <NumberInput
            value={parts.dayOfMonth}
            onChange={(day) =>
              setParts({ dayOfMonth: Math.min(28, Math.max(1, day ?? 1)) })
            }
            width="sm"
          />
        </div>
      ) : null}
      {parts.repeat === "week" ? (
        <div className={rowStyle}>
          <span className={mutedTextStyle}>On</span>
          <Select
            size="sm"
            items={weekdays.map((day, index) => ({
              value: String(index),
              text: day,
            }))}
            value={String(parts.dayOfWeek)}
            onChange={(day) => setParts({ dayOfWeek: Number(day ?? 1) })}
          />
        </div>
      ) : null}
      <div className={rowStyle}>
        <span className={mutedTextStyle}>At</span>
        <div className={css({ display: "flex", gap: "2" })}>
          <TextInput
            type="time"
            size="sm"
            value={parts.time}
            onChange={(time) => setParts({ time })}
          />
          <Select
            size="sm"
            items={timezones.map((zone) => ({ value: zone, text: zone }))}
            value={schedule.spec.timezone ?? "UTC"}
            onChange={(timezone) =>
              setSchedule({
                ...schedule,
                spec: { ...schedule.spec, timezone: timezone ?? undefined },
              })
            }
          />
        </div>
      </div>
      <span className={css({ fontSize: "sm", color: "neutral.s110" })}>
        {describeCron(schedule.spec)}
      </span>
      {document.inputs.length > 0 ? (
        <>
          <span
            className={css({
              fontSize: "xs",
              fontWeight: "semibold",
              color: "neutral.s90",
              textTransform: "uppercase",
            })}
          >
            Inputs on every run
          </span>
          {document.inputs.map((input) => (
            <div key={input.name} className={rowStyle}>
              <span
                className={mutedTextStyle}
                title={kindLabel(input.payloadKind, input.array)}
              >
                {input.label ?? input.name}
              </span>
              <InputControl
                input={input}
                value={
                  (schedule.inputValues[input.name] as Value | undefined) ??
                  null
                }
                onChange={(value) =>
                  setSchedule({
                    ...schedule,
                    inputValues: {
                      ...schedule.inputValues,
                      [input.name]: value as string | number | null,
                    },
                  })
                }
              />
            </div>
          ))}
          <span className={mutedTextStyle}>
            A schedule gives the same values every run, so a date like “last
            month” can’t be passed yet.
          </span>
        </>
      ) : null}
    </div>
  );
};

const EntityTriggerCard = () => {
  const { document, setDocument } = useEditor();
  const trigger = document.triggers.entity;
  const setTrigger = (next: EntityTriggerDraft | null) =>
    setDocument((current) => ({
      ...current,
      triggers: { ...current.triggers, entity: next },
    }));
  const entityInputs = document.inputs.filter(
    (input) => input.payloadKind === "EntityId" && !input.array,
  );

  return (
    <div className={cardStyle}>
      <div className={cardTitleStyle}>
        When an entity changes
        <OriginMark
          label="mock"
          hover="There is no entity-change trigger on main. Its shape is made up for this prototype."
        />
        {trigger ? (
          <span className={css({ marginLeft: "auto" })}>
            <Button
              size="xs"
              variant="ghost"
              iconName="trash"
              aria-label="Remove entity trigger"
              tooltip="Remove"
              onClick={() => setTrigger(null)}
            />
          </span>
        ) : null}
      </div>
      {trigger ? (
        <>
          <div className={rowStyle}>
            <span className={mutedTextStyle}>Type</span>
            <Select
              size="sm"
              items={mockEntityTypes.map((type) => ({
                value: type.baseUrl,
                text: type.title,
              }))}
              value={trigger.entityTypeBaseUrl}
              onChange={(value) =>
                value && setTrigger({ ...trigger, entityTypeBaseUrl: value })
              }
            />
          </div>
          <div className={rowStyle}>
            <span className={mutedTextStyle}>When it is</span>
            <SegmentedControl<EntityTriggerDraft["on"]>
              size="sm"
              items={[
                { value: "created", label: "Created" },
                { value: "updated", label: "Updated" },
                { value: "createdOrUpdated", label: "Either" },
              ]}
              value={trigger.on}
              onChange={(on) => setTrigger({ ...trigger, on })}
            />
          </div>
          <div className={rowStyle}>
            <span className={mutedTextStyle}>Passes it to</span>
            {entityInputs.length > 0 ? (
              <Select
                size="sm"
                items={entityInputs.map((input) => ({
                  value: input.name,
                  text: input.label ?? input.name,
                }))}
                value={trigger.passesTo}
                placeholder="Choose a Start input"
                onChange={(passesTo) => setTrigger({ ...trigger, passesTo })}
              />
            ) : (
              <span className={css({ fontSize: "sm", color: "neutral.s100" })}>
                Add an Entity input on Start first.
              </span>
            )}
          </div>
        </>
      ) : (
        <div>
          <Button
            size="sm"
            variant="subtle"
            iconName="cube"
            onClick={() =>
              setTrigger({
                entityTypeBaseUrl: mockEntityTypes[0].baseUrl,
                on: "created",
                passesTo: entityInputs[0]?.name ?? null,
                enabled: true,
              })
            }
          >
            Add an entity trigger
          </Button>
        </div>
      )}
    </div>
  );
};

/** How runs start, kept outside the flow (ledger, 8–9 Oct). A proposal: the team hasn't discussed it yet (20 Oct). */
export const TriggersDialog = () => {
  const { document, setUi } = useEditor();
  const doneRef = useRef<HTMLButtonElement>(null);
  const close = () => setUi((ui) => ({ ...ui, triggersOpen: false }));
  return (
    <Dialog
      size="md"
      onClose={close}
      aria-label="How runs start"
      initialFocusRef={doneRef as React.RefObject<HTMLElement>}
    >
      <Dialog.Header
        title="How runs start"
        description="Proposal · not discussed with the team yet"
      />
      <Dialog.Body>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "3",
          })}
        >
          <div className={cardStyle}>
            <div className={cardTitleStyle}>Manually</div>
            <span className={css({ fontSize: "sm", color: "neutral.s110" })}>
              {document.inputs.length > 0
                ? `Run asks for ${document.inputs.map((input) => input.label ?? input.name).join(", ")}.`
                : "Run starts it straight away: the flow takes no inputs."}
            </span>
          </div>
          <ScheduleCard />
          <EntityTriggerCard />
        </div>
      </Dialog.Body>
      <Dialog.Footer
        actions={
          <Button ref={doneRef} variant="solid" onClick={close}>
            Done
          </Button>
        }
      />
    </Dialog>
  );
};

/** One line for the top bar: how this flow starts. */
export const triggerSummary = (
  document: ReturnType<typeof useEditor>["document"],
) => {
  const parts = ["Manual"];
  if (document.triggers.schedule) {
    parts.push(describeCron(document.triggers.schedule.spec));
  }
  if (document.triggers.entity) {
    const type = findEntityType(document.triggers.entity.entityTypeBaseUrl);
    parts.push(
      `${type?.title ?? "Entity"} ${document.triggers.entity.on === "createdOrUpdated" ? "changes" : document.triggers.entity.on}`,
    );
  }
  return parts.join(" · ");
};

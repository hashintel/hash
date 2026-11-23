import { useId, useMemo, useRef, useState } from "react";

import { Button, Form, Popover, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  describeRepeatRule,
  formatScheduleTime,
  getRepeatPresets,
  getRepeatRuleKey,
  getWeekdayName,
  weekdaysFromMonday,
} from "../../shared/schedule-repeat";
import { formatScheduleSpec } from "../../shared/use-flow-schedules";
import {
  formatRunTime,
  getTimeZoneLabel,
  getTimeZones,
  getZonedDate,
} from "./schedule-times";

import type { RepeatRule, Weekday } from "../../shared/schedule-repeat";
import type { ScheduleFormValues } from "./trigger-form-values";

/** The Repeat options for choosing days of the week, and for keeping a spec the form can't make. */
const customKey = "custom";
const keptKey = "kept";

/** The times At offers, every quarter of an hour. */
const quarterHours = Array.from({ length: 96 }, (_, index) =>
  formatScheduleTime({ hour: Math.floor(index / 4), minute: (index % 4) * 15 }),
);

/* On one line, past the inputs' width if it needs to be, as in the design. */
const nextRunsText = css({
  textStyle: "sm",
  color: "fg.subtle",
  whiteSpace: "nowrap",
});
const customForm = css({ width: "[340px]" });
const customBody = css({ display: "flex", flexDirection: "column", gap: "2" });
const customLabel = css({ textStyle: "sm", color: "fg.subtle" });
const weekdayButtons = css({ display: "flex", gap: "1" });

/** Choosing the days of the week a trigger repeats on, beside Repeat. Done applies them; Cancel and Esc don't. */
const CustomRepeat = ({
  triggerRef,
  initialWeekdays,
  onDone,
  onClose,
}: {
  triggerRef: React.RefObject<HTMLElement | null>;
  initialWeekdays: Weekday[];
  onDone: (rule: RepeatRule) => void;
  onClose: () => void;
}) => {
  const [weekdays, setWeekdays] = useState(initialWeekdays);
  const labelId = useId();

  return (
    <Popover triggerRef={triggerRef} position="bottom-start" onClose={onClose}>
      <Popover.Container className={customForm}>
        <Popover.Header title="Custom" hideCloseButton />
        <Popover.Body>
          <div className={customBody}>
            <span className={customLabel} id={labelId}>
              On
            </span>
            <div
              className={weekdayButtons}
              role="group"
              aria-labelledby={labelId}
            >
              {weekdaysFromMonday.map((weekday) => {
                const name = getWeekdayName(weekday);
                const pressed = weekdays.includes(weekday);

                return (
                  <Button
                    key={weekday}
                    size="xs"
                    variant={pressed ? "solid" : "subtle"}
                    tone="neutral"
                    pressed={pressed}
                    aria-label={name}
                    onClick={() =>
                      setWeekdays((current) =>
                        current.includes(weekday)
                          ? current.filter((day) => day !== weekday)
                          : [...current, weekday],
                      )
                    }
                  >
                    {name.charAt(0)}
                  </Button>
                );
              })}
            </div>
          </div>
        </Popover.Body>
        <Popover.Footer
          actions={
            <>
              <Button variant="subtle" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={weekdays.length === 0}
                tooltip={
                  weekdays.length === 0 ? "Choose at least one day" : undefined
                }
                onClick={() => {
                  onDone({ kind: "weekly", weekdays });
                  onClose();
                }}
              >
                Done
              </Button>
            </>
          }
        />
      </Popover.Container>
    </Popover>
  );
};

/** Repeat, At, Time zone and the next runs. A kept spec, e.g. an interval, hides the fields it doesn't use. */
export const ScheduleFields = ({
  values,
  nextRuns,
  onChange,
}: {
  values: ScheduleFormValues;
  /** `null` when the runs can't be worked out. */
  nextRuns: Date[] | null;
  onChange: (values: ScheduleFormValues) => void;
}) => {
  const { repeat, time, timeZone } = values;
  const repeatRef = useRef<HTMLElement>(null);
  const [customOpen, setCustomOpen] = useState(false);

  const [now] = useState(() => new Date());

  const presets = useMemo(
    () => getRepeatPresets(getZonedDate(now, timeZone)),
    [now, timeZone],
  );
  const rules = useMemo(() => {
    /* The rule chosen stays an option when it isn't a preset, e.g. chosen weekdays. */
    const chosen =
      repeat.kind === "rule" &&
      !presets.some(
        (preset) => getRepeatRuleKey(preset) === getRepeatRuleKey(repeat.rule),
      )
        ? [repeat.rule]
        : [];

    return new Map(
      [...presets, ...chosen].map((rule) => [getRepeatRuleKey(rule), rule]),
    );
  }, [presets, repeat]);

  const repeatItems = [
    ...Array.from(rules, ([key, rule]) => ({
      value: key,
      text: describeRepeatRule(rule),
    })),
    ...(repeat.kind === "kept"
      ? [{ value: keptKey, text: formatScheduleSpec(repeat.scheduleSpec) }]
      : []),
    { value: customKey, text: "Custom…" },
  ];

  const timeText = formatScheduleTime(time);
  const timeItems = (
    quarterHours.includes(timeText)
      ? quarterHours
      : [...quarterHours, timeText].sort()
  ).map((text) => ({ value: text, text }));

  const timeZoneItems = useMemo(() => {
    const zones = getTimeZones();

    return (zones.includes(timeZone) ? zones : [timeZone, ...zones]).map(
      (zone) => ({ value: zone, text: getTimeZoneLabel(zone, now) }),
    );
  }, [timeZone, now]);

  return (
    <>
      <Form.Field layout="inline" label="Repeat">
        <Select<string>
          ref={repeatRef}
          required
          items={repeatItems}
          value={
            repeat.kind === "rule" ? getRepeatRuleKey(repeat.rule) : keptKey
          }
          onChange={(key) => {
            if (key === customKey) {
              setCustomOpen(true);
              return;
            }

            const rule = rules.get(key);

            if (rule) {
              onChange({ ...values, repeat: { kind: "rule", rule } });
            }
          }}
        />
      </Form.Field>
      {customOpen && (
        <CustomRepeat
          triggerRef={repeatRef}
          initialWeekdays={
            repeat.kind === "rule" && repeat.rule.kind === "weekly"
              ? repeat.rule.weekdays
              : []
          }
          onDone={(rule) =>
            onChange({ ...values, repeat: { kind: "rule", rule } })
          }
          onClose={() => setCustomOpen(false)}
        />
      )}
      {repeat.kind === "rule" && (
        <Form.Field layout="inline" label="At">
          <Select<string>
            required
            searchable
            items={timeItems}
            value={timeText}
            onChange={(text) => {
              const [hour = 0, minute = 0] = text.split(":").map(Number);

              onChange({ ...values, time: { hour, minute } });
            }}
          />
        </Form.Field>
      )}
      {(repeat.kind === "rule" || repeat.scheduleSpec.type === "cron") && (
        <Form.Field layout="inline" label="Time zone">
          <Select<string>
            required
            searchable
            items={timeZoneItems}
            value={timeZone}
            onChange={(zone) => onChange({ ...values, timeZone: zone })}
          />
        </Form.Field>
      )}
      <Form.Field layout="inline" label="Next runs" as="legend">
        <span className={nextRunsText}>
          {nextRuns === null
            ? "Can't be previewed"
            : nextRuns.length === 0
              ? "None"
              : nextRuns
                  /* An interval's runs are shown in the time zone a rule would start in, as it has none. */
                  .map((run) => formatRunTime(run, timeZone))
                  .join(" · ")}
        </span>
      </Form.Field>
    </>
  );
};

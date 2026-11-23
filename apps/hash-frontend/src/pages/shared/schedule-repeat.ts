/**
 * How often a schedule repeats, as the trigger form offers it, and the cron expression it compiles to.
 *
 * Temporal reads a cron expression's five fields as minute, hour, day of month, month and day of week, and a sixth as
 * the year. A time must match every field: unlike most cron implementations, a day of month and a day of week that are
 * both given must both match, rather than either. So the 2nd Tuesday of every month is the Tuesday among days 8 to 14.
 */

/** A day in the calendar, with its month from 1 (January) to 12. */
export type CalendarDate = { year: number; month: number; day: number };

/** A time of day, on a 24-hour clock. */
export type ScheduleTime = { hour: number; minute: number };

/** A day of the week, as cron numbers it: 0 for Sunday to 6 for Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type RepeatRule =
  | { kind: "once"; date: CalendarDate }
  /** On these days of every week: all seven is every day. */
  | { kind: "weekly"; weekdays: Weekday[] }
  /** On the nth of a weekday in every month, from the 1st to the 4th, as a 5th isn't in every month. */
  | { kind: "monthlyWeekday"; nth: 1 | 2 | 3 | 4; weekday: Weekday }
  /** On a day of every month, which is skipped in a month without it, e.g. the 31st. */
  | { kind: "monthlyDay"; day: number }
  | { kind: "yearly"; month: number; day: number };

const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const allWeekdays: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const workingWeekdays: Weekday[] = [1, 2, 3, 4, 5];

/** The days of the week from Monday to Sunday, in the order they're listed. */
export const weekdaysFromMonday: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export const getWeekdayName = (weekday: Weekday) => weekdayNames[weekday];

const toOrdinal = (number: number) => {
  const lastTwo = number % 100;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" }[number % 10] ?? "th");

  return `${number}${suffix}`;
};

const formatDayAndMonth = (month: number, day: number) =>
  `${day} ${monthNames[month - 1] ?? ""}`;

const formatList = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

const sameWeekdays = (left: Weekday[], right: Weekday[]) =>
  left.length === right.length &&
  left.every((weekday) => right.includes(weekday));

const getWeekday = ({ year, month, day }: CalendarDate) =>
  new Date(Date.UTC(year, month - 1, day)).getUTCDay() as Weekday;

/** e.g. "09:05". */
export const formatScheduleTime = ({ hour, minute }: ScheduleTime) =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

/** When a rule repeats, in words, e.g. "2nd Tuesday of every month". */
export const describeRepeatRule = (rule: RepeatRule): string => {
  switch (rule.kind) {
    case "once":
      return `Once on ${formatDayAndMonth(rule.date.month, rule.date.day)} ${rule.date.year}`;
    case "weekly":
      if (sameWeekdays(rule.weekdays, allWeekdays)) {
        return "Every day";
      }

      if (sameWeekdays(rule.weekdays, workingWeekdays)) {
        return "Every weekday";
      }

      return `Every ${formatList(
        weekdaysFromMonday
          .filter((weekday) => rule.weekdays.includes(weekday))
          .map(getWeekdayName),
      )}`;
    case "monthlyWeekday":
      return `${toOrdinal(rule.nth)} ${getWeekdayName(rule.weekday)} of every month`;
    case "monthlyDay":
      return `${toOrdinal(rule.day)} of every month`;
    case "yearly":
      return `Every year on ${formatDayAndMonth(rule.month, rule.day)}`;
  }
};

/** When a schedule runs, in words, e.g. "Every Monday at 08:00". */
export const describeSchedule = (rule: RepeatRule, time: ScheduleTime) =>
  `${describeRepeatRule(rule)} at ${formatScheduleTime(time)}`;

/** The cron fields that say which days a rule runs on: day of month, month, day of week and, for once, the year. */
const getDayFields = (rule: RepeatRule): string[] => {
  switch (rule.kind) {
    case "once":
      return [
        String(rule.date.day),
        String(rule.date.month),
        "*",
        String(rule.date.year),
      ];
    case "weekly": {
      if (sameWeekdays(rule.weekdays, allWeekdays)) {
        return ["*", "*", "*"];
      }

      return [
        "*",
        "*",
        sameWeekdays(rule.weekdays, workingWeekdays)
          ? "1-5"
          : rule.weekdays.toSorted((left, right) => left - right).join(","),
      ];
    }
    case "monthlyWeekday": {
      /* Both fields must match, so the nth weekday is the one among the nth seven days of the month. */
      const firstDay = (rule.nth - 1) * 7 + 1;

      return [`${firstDay}-${firstDay + 6}`, "*", String(rule.weekday)];
    }
    case "monthlyDay":
      return [String(rule.day), "*", "*"];
    case "yearly":
      return [String(rule.day), String(rule.month), "*"];
  }
};

/** The cron expression Temporal runs a rule at the time with, e.g. "0 9 8-14 * 2". */
export const toCronExpression = (rule: RepeatRule, time: ScheduleTime) =>
  [String(time.minute), String(time.hour), ...getDayFields(rule)].join(" ");

/** Identifies a rule among others whatever its time, e.g. as a select's value. */
export const getRepeatRuleKey = (rule: RepeatRule) =>
  getDayFields(rule).join(" ");

/** Names in cron fields, matched by their first three letters whatever their case. */
const cronMonthNames = monthNames.map((name) => name.toLowerCase());
const cronWeekdayNames = weekdayNames.map((name) =>
  name.slice(0, 3).toLowerCase(),
);

/**
 * The values a cron field matches, as Temporal reads it: `*`, `x`, `x-z`, `x/y` (x, x+y, x+2y and so on), `x-z/y` and
 * lists of them, with names of months and weekdays, or `null` if it isn't one.
 */
const parseCronField = (
  field: string,
  min: number,
  max: number,
  names: string[] = [],
): Set<number> | null => {
  const values = new Set<number>();

  const parseValue = (text: string) => {
    const nameIndex = names.indexOf(text.slice(0, 3).toLowerCase());

    if (nameIndex !== -1 && /^[a-z]+$/i.test(text)) {
      return nameIndex + min;
    }

    return /^\d+$/.test(text) ? Number(text) : null;
  };

  for (const item of field.split(",")) {
    const [range = "", stepText, ...rest] = item.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);

    if (rest.length > 0 || !Number.isInteger(step) || step < 1) {
      return null;
    }

    let first: number | null;
    let last: number | null;

    if (range === "*") {
      first = min;
      last = max;
    } else {
      const [start = "", end, ...more] = range.split("-");

      if (more.length > 0) {
        return null;
      }

      first = parseValue(start);
      last =
        end !== undefined
          ? parseValue(end)
          : stepText === undefined
            ? first
            : max;
    }

    if (first === null || last === null || first < min || last > max) {
      return null;
    }

    for (let value = first; value <= last; value += step) {
      values.add(value);
    }
  }

  return values;
};

export type CronFields = {
  seconds: number[];
  minutes: number[];
  hours: number[];
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  /** `null` for any year. */
  years: Set<number> | null;
};

/** A cron expression's fields, in Temporal's order: five, a sixth for the year, or a seventh first for the second. */
export const parseCronFields = (cronExpression: string): CronFields | null => {
  const fields = cronExpression.trim().split(/\s+/);

  if (fields.length < 5 || fields.length > 7) {
    return null;
  }

  const [secondField = "0", ...rest] =
    fields.length === 7 ? fields : ["0", ...fields];
  const [minute, hour, dayOfMonth, month, dayOfWeek, year = "*"] = rest;

  const seconds = parseCronField(secondField, 0, 59);
  const minutes = parseCronField(minute ?? "", 0, 59);
  const hours = parseCronField(hour ?? "", 0, 23);
  const daysOfMonth = parseCronField(dayOfMonth ?? "", 1, 31);
  const months = parseCronField(month ?? "", 1, 12, cronMonthNames);
  /* 7 is Sunday too. */
  const daysOfWeek = parseCronField(dayOfWeek ?? "", 0, 7, cronWeekdayNames);
  const years = year === "*" ? null : parseCronField(year, 1970, 9999);

  if (
    !seconds ||
    !minutes ||
    !hours ||
    !daysOfMonth ||
    !months ||
    !daysOfWeek ||
    (year !== "*" && !years)
  ) {
    return null;
  }

  const sorted = (values: Set<number>) =>
    [...values].sort((left, right) => left - right);

  return {
    seconds: sorted(seconds),
    minutes: sorted(minutes),
    hours: sorted(hours),
    daysOfMonth,
    months,
    daysOfWeek: new Set([...daysOfWeek].map((weekday) => weekday % 7)),
    years,
  };
};

/** The only value in a field, if it has just one. */
const getOnly = <Value extends number>(values: Iterable<Value>) => {
  const [only, ...rest] = values;

  return rest.length === 0 ? only : undefined;
};

/** Whether a field matches every value from `min` to `max`, as `*` does. */
const matchesAll = (values: Set<number>, min: number, max: number) =>
  values.size === max - min + 1;

/**
 * The rule and time a cron expression runs at, if it's one the form makes, however it's written: e.g. "0 9 * * 1",
 * "0 9 * * MON" and "0 0 9 * * 1" are all every Monday at 09:00. Others, e.g. "0 * * * *" for every hour, are `null`.
 */
export const parseCronExpression = (
  cronExpression: string,
): { rule: RepeatRule; time: ScheduleTime } | null => {
  const fields = parseCronFields(cronExpression);

  if (!fields) {
    return null;
  }

  const second = getOnly(fields.seconds);
  const minute = getOnly(fields.minutes);
  const hour = getOnly(fields.hours);

  if (second !== 0 || minute === undefined || hour === undefined) {
    return null;
  }

  const time = { hour, minute };
  const day = getOnly(fields.daysOfMonth);
  const month = getOnly(fields.months);
  const everyDayOfMonth = matchesAll(fields.daysOfMonth, 1, 31);
  const everyMonth = matchesAll(fields.months, 1, 12);
  const everyWeekday = matchesAll(fields.daysOfWeek, 0, 6);

  if (fields.years) {
    const year = getOnly(fields.years);

    return year !== undefined &&
      day !== undefined &&
      month !== undefined &&
      everyWeekday
      ? { rule: { kind: "once", date: { year, month, day } }, time }
      : null;
  }

  if (everyWeekday) {
    if (everyDayOfMonth && everyMonth) {
      return { rule: { kind: "weekly", weekdays: allWeekdays }, time };
    }

    if (day !== undefined && everyMonth) {
      return { rule: { kind: "monthlyDay", day }, time };
    }

    if (day !== undefined && month !== undefined) {
      return { rule: { kind: "yearly", month, day }, time };
    }

    return null;
  }

  if (!everyMonth) {
    return null;
  }

  const weekdays = [...fields.daysOfWeek].sort(
    (left, right) => left - right,
  ) as Weekday[];

  if (everyDayOfMonth) {
    return { rule: { kind: "weekly", weekdays }, time };
  }

  /* The nth weekday is the one among the nth seven days of the month, as `getDayFields` writes it. */
  const weekday = getOnly(weekdays);
  const firstDay = Math.min(...fields.daysOfMonth);
  const nth = ([1, 2, 3, 4] as const).find(
    (candidate) => firstDay === candidate * 7 - 6,
  );

  return weekday !== undefined &&
    nth !== undefined &&
    fields.daysOfMonth.size === 7 &&
    fields.daysOfMonth.has(firstDay + 6)
    ? { rule: { kind: "monthlyWeekday", nth, weekday }, time }
    : null;
};

/**
 * The repeats the form offers first, following a date, e.g. today: once on it, every day, every weekday, every week on
 * its weekday, every month on the same weekday of the month (left out after the 28th, as a 5th weekday isn't in every
 * month) or on the same day, and every year on it.
 */
export const getRepeatPresets = (date: CalendarDate): RepeatRule[] => {
  const weekday = getWeekday(date);
  const nth = Math.ceil(date.day / 7);

  return [
    { kind: "once", date },
    { kind: "weekly", weekdays: allWeekdays },
    { kind: "weekly", weekdays: workingWeekdays },
    { kind: "weekly", weekdays: [weekday] },
    ...(nth <= 4
      ? [
          {
            kind: "monthlyWeekday",
            nth: nth as 1 | 2 | 3 | 4,
            weekday,
          } as const,
        ]
      : []),
    { kind: "monthlyDay", day: date.day },
    { kind: "yearly", month: date.month, day: date.day },
  ];
};

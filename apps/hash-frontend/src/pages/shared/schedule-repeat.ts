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

const parseNumber = (field: string, min: number, max: number) => {
  /* Plain digits only, so `Number` cannot accept forms such as "1e1", " 5" or "0x1". */
  if (
    field.length === 0 ||
    field.length > 4 ||
    [...field].some((char) => char < "0" || char > "9")
  ) {
    return null;
  }

  const number = Number(field);

  return number >= min && number <= max ? number : null;
};

/** A day-of-week field of single days and ranges, e.g. "1-3,5", with 7 read as Sunday, as Temporal reads it. */
const parseWeekdays = (field: string): Weekday[] | null => {
  if (field === "*") {
    return allWeekdays;
  }

  const weekdays = new Set<Weekday>();

  for (const item of field.split(",")) {
    const [start, end = start, ...rest] = item.split("-");
    const first = start === undefined ? null : parseNumber(start, 0, 7);
    const last = parseNumber(end ?? "", 0, 7);

    if (rest.length > 0 || first === null || last === null || first > last) {
      return null;
    }

    for (let day = first; day <= last; day++) {
      weekdays.add((day % 7) as Weekday);
    }
  }

  return [...weekdays].sort((left, right) => left - right);
};

/**
 * The rule and time a cron expression runs at, if it's one the form makes: its day fields as `toCronExpression` writes
 * them, with a fixed minute and hour. Others, e.g. "0 * * * *" for every hour, are `null`.
 */
export const parseCronExpression = (
  cronExpression: string,
): { rule: RepeatRule; time: ScheduleTime } | null => {
  const [minuteField, hourField, dayOfMonth, month, dayOfWeek, year, ...rest] =
    cronExpression.trim().split(/\s+/);

  const minute = parseNumber(minuteField ?? "", 0, 59);
  const hour = parseNumber(hourField ?? "", 0, 23);

  if (
    rest.length > 0 ||
    minute === null ||
    hour === null ||
    dayOfMonth === undefined ||
    month === undefined ||
    dayOfWeek === undefined
  ) {
    return null;
  }

  const time = { hour, minute };
  const day = parseNumber(dayOfMonth, 1, 31);
  const monthNumber = parseNumber(month, 1, 12);

  if (year !== undefined) {
    const yearNumber = parseNumber(year, 1970, 9999);

    return yearNumber !== null &&
      day !== null &&
      monthNumber !== null &&
      dayOfWeek === "*"
      ? {
          rule: {
            kind: "once",
            date: { year: yearNumber, month: monthNumber, day },
          },
          time,
        }
      : null;
  }

  if (dayOfWeek === "*") {
    if (dayOfMonth === "*" && month === "*") {
      return { rule: { kind: "weekly", weekdays: allWeekdays }, time };
    }

    if (day !== null && month === "*") {
      return { rule: { kind: "monthlyDay", day }, time };
    }

    if (day !== null && monthNumber !== null) {
      return { rule: { kind: "yearly", month: monthNumber, day }, time };
    }

    return null;
  }

  if (month !== "*") {
    return null;
  }

  if (dayOfMonth === "*") {
    const weekdays = parseWeekdays(dayOfWeek);

    return weekdays ? { rule: { kind: "weekly", weekdays }, time } : null;
  }

  const weekday = parseNumber(dayOfWeek, 0, 7);
  const nth = ([1, 2, 3, 4] as const).find(
    (candidate) => dayOfMonth === `${candidate * 7 - 6}-${candidate * 7}`,
  );

  return weekday !== null && nth !== undefined
    ? {
        rule: {
          kind: "monthlyWeekday",
          nth,
          weekday: (weekday % 7) as Weekday,
        },
        time,
      }
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

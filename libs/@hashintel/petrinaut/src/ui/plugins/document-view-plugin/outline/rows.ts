/**
 * Data as the rows of an outline, in the manner of YAML: a key and its value
 * on a line, and the entries of a map or the items of a list indented under
 * it, each item under its place in the list. A closed map or list has no
 * rows of its own and says what it holds on its line.
 */

/** Which maps, lists and blocks of text are open. */
export type Expansion = {
  /** How many levels are open before the reader opens or closes anything. */
  readonly depth: number;
  /** The rows the reader flipped from that, by path. */
  readonly toggled: ReadonlySet<string>;
};

/** Open down to a depth: `0` closes everything and `Infinity` opens it all. */
export const openTo = (depth: number): Expansion => ({
  depth,
  toggled: new Set(),
});

export const toggleRow = (expansion: Expansion, path: string): Expansion => {
  const toggled = new Set(expansion.toggled);
  if (!toggled.delete(path)) {
    toggled.add(path);
  }
  return { ...expansion, toggled };
};

export type OutlineRow = {
  /** Names the row among the others, and from one version of the data to the next. */
  readonly path: string;
  readonly depth: number;
  /** The entry's key in its map, or the item's place in its list. */
  readonly key: string | number;
  readonly value:
    | {
        readonly kind: "scalar";
        /** `empty` is a map or a list with nothing in it. */
        readonly type: "string" | "number" | "boolean" | "null" | "empty";
        readonly text: string;
      }
    /** A map or a list that holds something; `summary` says what, for the line of a closed one. */
    | {
        readonly kind: "collection";
        readonly open: boolean;
        readonly summary: string;
      }
    /** Text of several lines, drawn as a block under its line. */
    | {
        readonly kind: "text";
        readonly open: boolean;
        readonly text: string;
        readonly lineCount: number;
      };
};

type DataMap = Readonly<Record<string, unknown>>;
type DataList = readonly unknown[];
type Collection = DataMap | DataList;

const isList = (value: unknown): value is DataList => Array.isArray(value);

const isMap = (value: unknown): value is DataMap =>
  typeof value === "object" && value !== null && !isList(value);

/** A map's entries that hold a value: a key set to `undefined` is not stored. */
const entriesOf = (map: DataMap) =>
  Object.entries(map).filter(([, value]) => value !== undefined);

/** Whether a value is a map or a list with something in it, which gets rows of its own. */
const holdsRows = (value: unknown): value is Collection =>
  isList(value)
    ? value.length > 0
    : isMap(value) && entriesOf(value).length > 0;

const isBlock = (value: unknown): value is string =>
  typeof value === "string" && value.includes("\n");

/** A value that is neither a map or a list with rows, nor a block of text, as it reads on a line. */
const scalarOf = (
  value: unknown,
): Extract<OutlineRow["value"], { kind: "scalar" }> => {
  if (isList(value) || isMap(value)) {
    return { kind: "scalar", type: "empty", text: isList(value) ? "[]" : "{}" };
  }
  if (typeof value === "string") {
    return { kind: "scalar", type: "string", text: JSON.stringify(value) };
  }
  if (typeof value === "number") {
    return { kind: "scalar", type: "number", text: String(value) };
  }
  if (typeof value === "boolean") {
    return { kind: "scalar", type: "boolean", text: String(value) };
  }
  return { kind: "scalar", type: "null", text: "null" };
};

/** How much of what it holds a closed map's or list's line shows. */
const summaryLength = 64;

/** Whether a value reads on one line as it is: no block of text, no map or list with rows. */
const isPlain = (value: unknown) => !isBlock(value) && !holdsRows(value);

/**
 * A value that reads whole on one line, as that line: a plain value, or a
 * short list of them, such as a patch's path. Anything else is `null`.
 */
const wholeOf = (value: unknown): string | null => {
  if (isPlain(value)) {
    return scalarOf(value).text;
  }
  if (!isList(value) || !value.every(isPlain)) {
    return null;
  }
  const whole = `[${value.map((item) => scalarOf(item).text).join(", ")}]`;
  return whole.length <= summaryLength ? whole : null;
};

/**
 * What a closed map or list says of itself. A list says its items where they
 * read whole, else how many it holds. A map says as many of its entries as
 * fit, its `name` first: those that read whole, and its lists.
 */
const summaryOf = (collection: Collection): string => {
  if (isList(collection)) {
    return (
      wholeOf(collection) ??
      `[${collection.length} ${collection.length === 1 ? "item" : "items"}]`
    );
  }
  const entries = entriesOf(collection);
  const said = entries
    .flatMap(([key, value]) => {
      const text = isList(value) ? summaryOf(value) : wholeOf(value);
      return text === null ? [] : [{ key, text: `${key}: ${text}` }];
    })
    .sort((a, b) => Number(b.key === "name") - Number(a.key === "name"));
  const shown: string[] = [];
  for (const { text } of said) {
    if (shown.join(", ").length + text.length > summaryLength) {
      break;
    }
    shown.push(text);
  }
  return `{ ${[...shown, ...(shown.length < entries.length ? ["…"] : [])].join(", ")} }`;
};

/** Any value as it reads on one line: what a closed row of it would say. */
export const onOneLine = (value: unknown): string =>
  isBlock(value)
    ? `| ${value.split("\n").length} lines`
    : holdsRows(value)
      ? summaryOf(value)
      : scalarOf(value).text;

/** A key as a segment of a path, in the manner of a JSON pointer. */
const segmentOf = (key: string): string =>
  key.replaceAll("~", "~0").replaceAll("/", "~1");

/**
 * What each item of a list goes by in a path: its `id` where it has one of
 * its own, so that a row stays open while items come, go and move, else its
 * place in the list.
 */
const itemSegments = (items: DataList): string[] => {
  const idOf = (item: unknown) =>
    isMap(item) && typeof item.id === "string" ? item.id : null;
  const timesSeen = new Map<string, number>();
  for (const item of items) {
    const id = idOf(item);
    if (id !== null) {
      timesSeen.set(id, (timesSeen.get(id) ?? 0) + 1);
    }
  }
  return items.map((item, index) => {
    const id = idOf(item);
    return id !== null && timesSeen.get(id) === 1
      ? `#${segmentOf(id)}`
      : String(index);
  });
};

/** The rows of a map or a list. Any other data, or an empty one, has none. */
export const outlineRows = (
  data: unknown,
  expansion: Expansion,
  /** For data that is a list: what each item goes by in a path, in place of its `id` or its place. */
  itemNames?: readonly string[],
): OutlineRow[] => {
  const rows: OutlineRow[] = [];

  const addRows = (
    collection: Collection,
    parent: string,
    depth: number,
    names?: readonly string[],
  ) => {
    const children: [key: string | number, segment: string, value: unknown][] =
      isList(collection)
        ? (names ?? itemSegments(collection)).map((segment, index) => [
            index,
            segment,
            collection[index],
          ])
        : entriesOf(collection).map(([key, value]) => [
            key,
            segmentOf(key),
            value,
          ]);

    for (const [key, segment, value] of children) {
      const path = `${parent}/${segment}`;
      // A block of text opens by itself only where everything does.
      const open =
        (isBlock(value)
          ? expansion.depth === Infinity
          : depth < expansion.depth) !== expansion.toggled.has(path);

      if (isBlock(value)) {
        const lineCount = value.split("\n").length;
        rows.push({
          path,
          depth,
          key,
          value: { kind: "text", open, text: value, lineCount },
        });
      } else if (holdsRows(value)) {
        rows.push({
          path,
          depth,
          key,
          value: { kind: "collection", open, summary: summaryOf(value) },
        });
        if (open) {
          addRows(value, path, depth + 1);
        }
      } else {
        rows.push({ path, depth, key, value: scalarOf(value) });
      }
    }
  };

  if (holdsRows(data)) {
    addRows(data, "", 0, itemNames);
  }
  return rows;
};

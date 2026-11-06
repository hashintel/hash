import {
  Array,
  Brand,
  Function,
  HashMap,
  HashSet,
  MutableHashMap,
  Option,
  Result,
  Schema,
  pipe,
} from "effect";

export type File = string & Brand.Brand<"File">;
export const File = Brand.nominal<File>();

export type AnchorId = string & Brand.Brand<"AnchorId">;
export const AnchorId = Brand.nominal<AnchorId>();

/** Logical page names stay independent of filenames and relative URLs. */
export type Path = readonly string[];

/** The file and optional element id used by both a rendered entry and links to it. */
export interface Anchor {
  readonly file: File;
  readonly id: Option.Option<AnchorId>;
}

/** Allocates element ids after reserving identities that links already reference. */
export interface Ids {
  readonly reserve: (file: File, preferred: AnchorId) => AnchorId;
}

export const ids = (anchors: Iterable<Anchor>): Ids => {
  const used = MutableHashMap.empty<File, HashSet.HashSet<AnchorId>>();
  for (const { file, id } of anchors) {
    if (Option.isSome(id)) {
      const occupied = MutableHashMap.get(used, file).pipe(
        Option.getOrElse(HashSet.empty<AnchorId>),
      );

      MutableHashMap.set(used, file, HashSet.add(occupied, id.value));
    }
  }

  return {
    reserve(file, preferred) {
      const occupied = MutableHashMap.get(used, file).pipe(
        Option.getOrElse(HashSet.empty<AnchorId>),
      );

      let id = preferred;
      for (let suffix = 2; HashSet.has(occupied, id); suffix += 1) {
        id = AnchorId(`${preferred}-${suffix}`);
      }

      MutableHashMap.set(used, file, HashSet.add(occupied, id));
      return id;
    },
  };
};

// oxlint-disable-next-line unicorn/throw-new-error -- Schema constructs the tagged error.
export class AnchorError extends Schema.TaggedError<AnchorError>()(
  "AnchorError",
  {
    reason: Schema.TaggedUnion({
      DuplicatePath: { path: Schema.Array(Schema.String) },
      FileCollision: { file: Schema.String },
    }),
  },
) {}

/** Encodes a single filename component, including names that would otherwise traverse directories. */
const segment = (name: string): string => {
  if (name === "") {
    return "%00";
  }

  if (name === "." || name === "..") {
    return name.replaceAll(".", "%2E");
  }

  return encodeURIComponent(name);
};

/** Pages with descendants become directory indexes. Colliding output files fail before rendering. */
export const files = (
  paths: readonly Path[],
): Result.Result<HashMap.HashMap<Path, File>, AnchorError> =>
  Result.gen(function* () {
    const parents = pipe(
      paths,
      Array.flatMap((path) =>
        Array.map(path, (_, end) => Array.take(path, end)),
      ),
      HashSet.fromIterable,
    );

    let visited = HashSet.empty<Path>();
    let filenames = HashSet.empty<string>();
    const entries: (readonly [Path, File])[] = [];

    for (const path of paths) {
      if (HashSet.has(visited, path)) {
        return yield* Result.fail(
          AnchorError.make({ reason: { _tag: "DuplicatePath", path } }),
        );
      }

      visited = HashSet.add(visited, path);
      const encoded = Array.map(path, segment);

      const file = pipe(
        Array.last(encoded),
        Option.filter(() => !HashSet.has(parents, path)),
        Option.match({
          onNone: () => Array.append(encoded, "index.html").join("/"),
          onSome: (last) =>
            Array.append(Array.dropRight(encoded, 1), `${last}.html`).join("/"),
        }),
      );

      const key = file.toLowerCase();
      if (HashSet.has(filenames, key)) {
        return yield* Result.fail(
          AnchorError.make({ reason: { _tag: "FileCollision", file } }),
        );
      }

      filenames = HashSet.add(filenames, key);
      entries.push([path, File(file)]);
    }

    return HashMap.fromIterable(entries);
  });

/** Encodes physical filenames as URL components. Encoded characters in a filename remain literal. */
export const relative: {
  (to: string): (from: string) => string;
  (from: string, to: string): string;
} = Function.dual(2, (from: string, to: string): string => {
  const directory = Array.dropRight(from.split("/"), 1);
  const destination = to.split("/");

  const shared = pipe(
    Array.zip(directory, Array.dropRight(destination, 1)),
    Array.takeWhile(([own, other]) => own === other),
  ).length;

  const up = Array.map(Array.drop(directory, shared), () => "..");
  return pipe(
    up.length > 0 ? up : ["."],
    Array.appendAll(
      Array.map(Array.drop(destination, shared), encodeURIComponent),
    ),
    Array.join("/"),
  );
});

/** Same-page entries use fragments alone. A page without an element id links to its file. */
export const href: {
  (from: string): (anchor: Anchor) => string;
  (anchor: Anchor, from: string): string;
} = Function.dual(2, ({ file, id }: Anchor, from: string): string => {
  if (file === from && Option.isSome(id)) {
    return `#${encodeURIComponent(id.value)}`;
  }

  const path = relative(from, file);
  return Option.match(id, {
    onNone: () => path,
    onSome: (value) => `${path}#${encodeURIComponent(value)}`,
  });
});

/**
 * Search over the bundle's index: every page cut into sections, ranked in
 * the browser by MiniSearch, grouped under their pages. The field in the
 * header opens a dialog; the index and the engine load on the first open.
 */

import { useRouter } from "@tanstack/react-router";
import {
  Suspense,
  use,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

import { hrefOf } from "./pages";
import {
  createEngine,
  type Hit,
  type HitGroup,
  type SearchEngine,
} from "./search/engine";
import { nextActive } from "./search/next-active";
import { MagnifierIcon } from "./shell/icons";

import type { SearchIndex } from "../../src/bundle/search";

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable);

/** The index is served as a plain file, fetched once beside the engine. */
const indexUrl = new URL("./content/search.json", import.meta.url);

let enginePromise: Promise<SearchEngine> | null = null;

/** One promise for the module's lifetime, so `use()` settles once and reads synchronously after. */
const loadEngine = (): Promise<SearchEngine> => {
  enginePromise ??= Promise.all([
    import("minisearch"),
    fetch(indexUrl).then((response) => response.json() as Promise<SearchIndex>),
  ]).then(([{ default: MiniSearch }, index]) =>
    createEngine(MiniSearch, index.documents),
  );
  return enginePromise;
};

const Excerpt = ({ hit }: { hit: Hit }) => (
  <p className="pnd-search-excerpt">
    {hit.excerpt.map((part, position) =>
      part.matched ? (
        <mark key={position}>{part.text}</mark>
      ) : (
        <span key={position}>{part.text}</span>
      ),
    )}
  </p>
);

const Results = ({
  query,
  groups,
  hits,
  active,
  onPick,
  onHover,
}: {
  query: string;
  groups: HitGroup[];
  /** The groups' hits flattened, in the order the arrow keys walk them. */
  hits: Hit[];
  active: number;
  onPick: (hit: Hit) => void;
  onHover: (index: number) => void;
}) => {
  if (query.trim() === "") {
    return (
      <p className="pnd-search-empty">
        Type to search the architecture: layers, interfaces, guides.
      </p>
    );
  }
  if (groups.length === 0) {
    return (
      <p className="pnd-search-empty">
        No results for <q>{query}</q>.
      </p>
    );
  }
  const indexOf = new Map(hits.map((hit, index) => [hit.id, index]));
  return (
    <ol className="pnd-search-groups" role="listbox" id="pnd-search-results">
      {groups.map((group) => (
        <li key={group.slug} className="pnd-search-group">
          <div className="pnd-search-page">
            <span className="pnd-search-page-title">{group.title}</span>
            <span className="pnd-search-kind">
              {group.kind === "authored" ? "guide" : "reference"}
            </span>
          </div>
          <ol className="pnd-search-hits">
            {group.hits.map((hit) => {
              const index = indexOf.get(hit.id) ?? 0;
              return (
                <li
                  key={hit.id}
                  id={`pnd-search-hit-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={`pnd-search-hit${index === active ? " active" : ""}`}
                  onPointerEnter={() => onHover(index)}
                  onClick={() => onPick(hit)}
                >
                  <span className="pnd-search-heading">
                    {hit.heading?.text ?? "Overview"}
                  </span>
                  <Excerpt hit={hit} />
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ol>
  );
};

interface FieldProps {
  query: string;
  active: number;
  hitCount: number;
  inputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onClose: () => void;
}

const Field = ({
  query,
  active,
  hitCount,
  inputRef,
  onQueryChange,
  onKeyDown,
  onClose,
}: FieldProps) => (
  <div className="pnd-search-field">
    <MagnifierIcon size="1.25em" />
    <input
      ref={inputRef}
      type="search"
      placeholder="Search the architecture…"
      autoComplete="off"
      autoFocus
      spellCheck={false}
      role="combobox"
      aria-controls="pnd-search-results"
      aria-expanded={hitCount > 0}
      aria-activedescendant={
        hitCount > 0 ? `pnd-search-hit-${active}` : undefined
      }
      value={query}
      onChange={(event) => onQueryChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
    <button type="button" className="pnd-search-close" onClick={onClose}>
      <kbd>Esc</kbd>
    </button>
  </div>
);

/** The field and the body while the engine loads: typing works, searching waits. */
const Loading = (props: FieldProps) => (
  <>
    <Field {...props} />
    <div className="pnd-search-body">
      <p className="pnd-search-empty">Loading the index…</p>
    </div>
  </>
);

const Panel = ({
  onPick,
  onActiveChange,
  ...field
}: FieldProps & {
  onPick: (hit: Hit) => void;
  onActiveChange: (index: number) => void;
}) => {
  const engine = use(loadEngine());
  const groups = engine.search(field.query);
  const hits = groups.flatMap((group) => group.hits);

  // Moving by key brings the hit into view, with its page's label when it
  // is the first of its page; moving by pointer must not, or hovering near
  // an edge would scroll the list under the pointer.
  const moveTo = (index: number): void => {
    onActiveChange(index);
    const hit = document.getElementById(`pnd-search-hit-${index}`);
    const target =
      hit?.previousElementSibling === null
        ? hit.closest(".pnd-search-group")
        : hit;
    target?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    const moved = nextActive(field.active, event.key, hits.length);
    if (moved !== null) {
      event.preventDefault();
      moveTo(moved);
      return;
    }
    if (event.key === "Enter") {
      const hit = hits[field.active];
      if (hit !== undefined) {
        event.preventDefault();
        onPick(hit);
      }
    }
  };

  return (
    <>
      <Field {...field} hitCount={hits.length} onKeyDown={onKeyDown} />
      <div className="pnd-search-body">
        <Results
          query={field.query}
          groups={groups}
          hits={hits}
          active={field.active}
          onPick={onPick}
          onHover={onActiveChange}
        />
      </div>
    </>
  );
};

export const Search = () => {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  // The dialog element owns its own open state; this mirrors ours into it
  // and takes the element's close, from Esc, back.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return undefined;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.select();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    const onClose = (): void => setOpen(false);
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        (event.key === "/" && !isTyping(event.target)) ||
        ((event.metaKey || event.ctrlKey) && event.key === "k")
      ) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const close = (): void => setOpen(false);

  const pick = (hit: Hit): void => {
    close();
    void router.navigate({
      href: `${hrefOf(hit.slug)}${hit.heading === null ? "" : `#${hit.heading.slug}`}`,
    });
  };

  const field: FieldProps = {
    query,
    active,
    hitCount: 0,
    inputRef,
    onQueryChange: (next) => {
      setQuery(next);
      setActive(0);
    },
    onClose: close,
  };

  return (
    <div className="pnd-search">
      <button
        type="button"
        data-open-modal=""
        aria-label="Search"
        aria-keyshortcuts="/ Control+K Meta+K"
        onClick={() => setOpen(true)}
      >
        <MagnifierIcon size="1.25em" />
        <span className="sl-hidden md:sl-block" aria-hidden="true">
          Search
        </span>
        <kbd className="sl-hidden md:sl-block" aria-hidden="true">
          /
        </kbd>
      </button>
      <dialog
        ref={dialogRef}
        className="pnd-search-dialog"
        aria-label="Search"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            close();
          }
        }}
      >
        <div className="pnd-search-frame">
          {open ? (
            <Suspense fallback={<Loading {...field} />}>
              <Panel {...field} onPick={pick} onActiveChange={setActive} />
            </Suspense>
          ) : null}
          <div className="pnd-search-footer">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> move
            </span>
            <span>
              <kbd>↵</kbd> open
            </span>
            <span>
              <kbd>Esc</kbd> close
            </span>
          </div>
        </div>
      </dialog>
    </div>
  );
};

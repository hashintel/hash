/**
 * Search over the bundle's index: every page cut into sections, ranked in
 * the browser by MiniSearch, grouped under their pages. The field in the
 * header opens a dialog; the index and the engine load on the first open.
 */

import { useRouter } from "@tanstack/react-router";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { hrefOf } from "./pages";
import { createEngine, type Hit, type SearchEngine } from "./search/engine";
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

const engineOnce = (): Promise<SearchEngine> => {
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
  engine,
  query,
  active,
  onPick,
  onHover,
}: {
  engine: SearchEngine | null;
  query: string;
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
  if (engine === null) {
    return <p className="pnd-search-empty">Loading the index…</p>;
  }
  const groups = engine.search(query);
  if (groups.length === 0) {
    return (
      <p className="pnd-search-empty">
        No results for <q>{query}</q>.
      </p>
    );
  }
  // Hits are numbered across groups, as the arrow keys move through them.
  const indexOf = new Map(
    groups.flatMap((group) => group.hits).map((hit, index) => [hit.id, index]),
  );
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

export const Search = () => {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [engine, setEngine] = useState<SearchEngine | null>(null);

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

  useEffect(() => {
    if (!open || engine !== null) {
      return undefined;
    }
    let cancelled = false;
    void engineOnce().then((loaded) => {
      if (!cancelled) {
        setEngine(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, engine]);

  const hits =
    engine === null ? [] : engine.search(query).flatMap((group) => group.hits);

  const pick = (hit: Hit): void => {
    setOpen(false);
    void router.navigate({
      href: `${hrefOf(hit.slug)}${hit.heading === null ? "" : `#${hit.heading.slug}`}`,
    });
  };

  // Moving by key brings the hit into view, with its page's label when it
  // is the first of its page; moving by pointer must not, or hovering near
  // an edge would scroll the list under the pointer.
  const moveTo = (index: number): void => {
    setActive(index);
    const hit = document.getElementById(`pnd-search-hit-${index}`);
    const target =
      hit?.previousElementSibling === null
        ? hit.closest(".pnd-search-group")
        : hit;
    target?.scrollIntoView({ block: "nearest" });
  };

  const onInputKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveTo(Math.min(active + 1, Math.max(0, hits.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveTo(Math.max(0, active - 1));
    } else if (event.key === "Enter") {
      const hit = hits[active];
      if (hit !== undefined) {
        event.preventDefault();
        pick(hit);
      }
    }
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
            setOpen(false);
          }
        }}
      >
        <div className="pnd-search-frame">
          <div className="pnd-search-field">
            <MagnifierIcon size="1.25em" />
            <input
              ref={inputRef}
              type="search"
              placeholder="Search the architecture…"
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-controls="pnd-search-results"
              aria-expanded={hits.length > 0}
              aria-activedescendant={
                hits.length > 0 ? `pnd-search-hit-${active}` : undefined
              }
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKeyDown}
            />
            <button
              type="button"
              className="pnd-search-close"
              onClick={() => setOpen(false)}
            >
              <kbd>Esc</kbd>
            </button>
          </div>
          <div className="pnd-search-body">
            {open ? (
              <Results
                engine={engine}
                query={query}
                active={active}
                onPick={pick}
                onHover={setActive}
              />
            ) : null}
          </div>
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

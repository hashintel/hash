import { useEffect, useMemo, useState } from "preact/hooks";

import {
  type Card,
  LABELS,
  LABEL_DETAILS,
  type Label,
  parseCardText,
} from "../../../core.ts";
import {
  type QualificationDraft,
  RECOMMENDED_QUALIFICATION_SIZE,
  countQualificationLabels,
} from "../../../study-planning.ts";
import { RelationCardContent } from "../shared/relation-card-content.tsx";

const PAGE_SIZE = 12;

const QualificationEditor = ({
  card,
  draft,
  onSave,
  onRemove,
}: {
  card: Card;
  draft: QualificationDraft | undefined;
  onSave: (draft: QualificationDraft) => void;
  onRemove: (relationId: string) => void;
}) => {
  const [answer, setAnswer] = useState<Label | null>(draft?.answer ?? null);
  const [rationale, setRationale] = useState(draft?.rationale ?? "");

  useEffect(() => {
    setAnswer(draft?.answer ?? null);
    setRationale(draft?.rationale ?? "");
  }, [card.relation_id, draft?.answer, draft?.rationale]);

  return (
    <div class="qualification-editor">
      <article class="qualification-preview">
        <div class="card-meta">
          <span>{card.relation_id}</span>
          <span>{card.prescreen}</span>
          {draft ? <strong>{draft.answer} anchor</strong> : null}
        </div>
        <RelationCardContent cardText={card.card_text} compact />
      </article>
      <form
        class="qualification-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (answer) {
            onSave({
              relationId: card.relation_id,
              answer,
              rationale,
            });
          }
        }}
      >
        <fieldset class="qualification-labels">
          <legend>Reference answer</legend>
          {LABELS.map((label) => {
            const detail = LABEL_DETAILS[label];
            return (
              <label
                key={label}
                class={`qualification-label label-${label.toLowerCase()}`}
                title={detail.description}
              >
                <input
                  type="radio"
                  name={`qualification-answer-${card.relation_id}`}
                  value={label}
                  checked={answer === label}
                  required
                  onChange={() => setAnswer(label)}
                />
                <span>
                  <strong>
                    {label} · {detail.name}
                  </strong>
                  <small>{detail.description}</small>
                </span>
              </label>
            );
          })}
        </fieldset>
        <label class="field">
          Required rationale
          <textarea
            rows={4}
            value={rationale}
            required
            placeholder="State the relation geometry that makes this the reference answer."
            onInput={(event) => setRationale(event.currentTarget.value)}
          />
        </label>
        <div class="form-actions">
          <button class="button button-primary" type="submit">
            {draft ? "Update anchor" : "Add qualification anchor"}
          </button>
          {draft ? (
            <button
              class="button button-quiet"
              type="button"
              onClick={() => onRemove(card.relation_id)}
            >
              Remove anchor
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
};

export const QualificationStep = ({
  cards,
  drafts,
  selectedRelationId,
  onSelect,
  onSave,
  onRemove,
  onBack,
  onContinue,
}: {
  cards: readonly Card[];
  drafts: readonly QualificationDraft[];
  selectedRelationId: string | null;
  onSelect: (relationId: string) => void;
  onSave: (draft: QualificationDraft) => void;
  onRemove: (relationId: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) => {
  const [query, setQuery] = useState("");
  const [anchorsOnly, setAnchorsOnly] = useState(false);
  const [page, setPage] = useState(0);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const draftsByRelationId = useMemo(
    () => new Map(drafts.map((draft) => [draft.relationId, draft] as const)),
    [drafts],
  );
  const filteredCards = useMemo(
    () =>
      cards.filter((card) => {
        const matchesQuery =
          normalizedQuery === "" ||
          card.relation_id.toLocaleLowerCase().includes(normalizedQuery) ||
          card.card_text.toLocaleLowerCase().includes(normalizedQuery);
        return (
          matchesQuery &&
          (!anchorsOnly || draftsByRelationId.has(card.relation_id))
        );
      }),
    [anchorsOnly, cards, draftsByRelationId, normalizedQuery],
  );
  const pageCount = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleCards = filteredCards.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );
  const selectedCard =
    filteredCards.find((card) => card.relation_id === selectedRelationId) ??
    visibleCards[0] ??
    null;
  const labelCounts = countQualificationLabels(drafts);

  return (
    <section class="builder-step-panel" aria-labelledby="qualification-title">
      <header class="builder-step-heading">
        <div>
          <p class="system-label">Step 2 · reference set</p>
          <h2 id="qualification-title">Curate qualification anchors.</h2>
          <p>
            Choose known examples from the source pool. Card text stays
            read-only; you supply the reference class and rationale.
          </p>
        </div>
        <div class="anchor-readout">
          <strong>{drafts.length}</strong>
          <span>of about {RECOMMENDED_QUALIFICATION_SIZE} recommended</span>
        </div>
      </header>

      <dl class="anchor-distribution" aria-label="Qualification class counts">
        {LABELS.map((label) => (
          <div key={label} class={`label-${label.toLowerCase()}`}>
            <dt>
              {label} · {LABEL_DETAILS[label].name}
            </dt>
            <dd>{labelCounts[label]}</dd>
          </div>
        ))}
      </dl>

      <div class="qualification-workbench">
        <aside class="card-pool-browser">
          <label class="field">
            Search {cards.length.toLocaleString()} cards
            <input
              type="search"
              value={query}
              placeholder="Relation, ID, type, example…"
              onInput={(event) => {
                setQuery(event.currentTarget.value);
                setPage(0);
              }}
            />
          </label>
          <p class="pool-browser-count" aria-live="polite">
            {filteredCards.length.toLocaleString()} matching ·{" "}
            {drafts.length.toLocaleString()} anchored
          </p>
          <label class="pool-filter-toggle">
            <input
              type="checkbox"
              checked={anchorsOnly}
              onChange={(event) => {
                setAnchorsOnly(event.currentTarget.checked);
                setPage(0);
              }}
            />
            Show anchors only
          </label>
          {visibleCards.length > 0 ? (
            <ul class="pool-card-list">
              {visibleCards.map((card) => {
                const draft = draftsByRelationId.get(card.relation_id);
                const parsedCardText = parseCardText(card.card_text);
                const relationName =
                  parsedCardText.kind === "structured"
                    ? parsedCardText.relation
                    : (card.card_text
                        .split(/\r?\n/u)
                        .find((line) => line.trim())
                        ?.replace(/^Relation:\s*/u, "") ?? card.relation_id);
                return (
                  <li key={card.card_hash}>
                    <button
                      type="button"
                      aria-current={
                        selectedCard?.relation_id === card.relation_id
                          ? "true"
                          : undefined
                      }
                      onClick={() => onSelect(card.relation_id)}
                    >
                      <span>
                        <strong>{card.relation_id}</strong>
                        <small>{relationName}</small>
                      </span>
                      <em>{draft ? `${draft.answer} anchor` : "Open"}</em>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p class="empty-inline">
              <strong>No matching cards.</strong>
              {anchorsOnly
                ? "Add an anchor or show the full pool."
                : "Try a relation ID, label, type, or example term."}
            </p>
          )}
          <div class="pagination-controls">
            <button
              class="button button-quiet"
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage(Math.max(0, safePage - 1))}
            >
              Previous
            </button>
            <span>
              {safePage + 1} / {pageCount}
            </span>
            <button
              class="button button-quiet"
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
            >
              Next
            </button>
          </div>
        </aside>

        {selectedCard ? (
          <QualificationEditor
            card={selectedCard}
            draft={draftsByRelationId.get(selectedCard.relation_id)}
            onSave={onSave}
            onRemove={onRemove}
          />
        ) : (
          <p class="empty-inline">
            <strong>Select a card to inspect.</strong>
            The full relation document will appear here.
          </p>
        )}
      </div>

      <div class="builder-step-actions">
        <button class="button button-quiet" type="button" onClick={onBack}>
          Back to import
        </button>
        <button
          class="button button-primary"
          type="button"
          onClick={onContinue}
        >
          Continue to planning
        </button>
      </div>
    </section>
  );
};

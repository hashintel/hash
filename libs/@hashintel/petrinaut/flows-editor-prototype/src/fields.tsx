import { useEffect, useRef, useState } from "react";

import {
  Button,
  Chip,
  Icon,
  Menu,
  Select,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { type CatalogEntry, getCatalogEntry, type InputView } from "./catalog";
import {
  collapsePath,
  ConditionBuilder,
  tokenPath,
  UseVariable,
} from "./condition-builder";
import {
  type DraftActionStep,
  type EditorDocument,
  entityTypeOf,
  fieldKey,
  stepLabel,
  findStep,
  type QueryDraft,
  type RefSource,
  setInputSource,
  type TemplatePart,
  VALUE_SUBJECT,
} from "./document";
import { useEditor } from "./editor-context";
import {
  findEntityType,
  findPropertyType,
  type MockPropertyType,
  mockEntities,
  mockEntityTypes,
  mockFiles,
  mockPeopleEmails,
} from "./mock-graph";
import { describeSource, getSourceShape } from "./shapes";
import { entityChoices, SourceMenu } from "./source-menu";
import {
  errorTextStyle,
  firstAndMore,
  isEmail,
  isTypedKind,
  TypedValue,
} from "./typed-value";
import {
  keyStyle,
  kindLabel,
  mutedTextStyle,
  PropertyRow,
  selectTriggerStyle,
} from "./ui";

import type { StepInputSource } from "./engine";

type FieldProps = {
  step: DraftActionStep;
  input: InputView;
  entry: CatalogEntry;
};

/* ---------------------------------------------------------------------------------------------------------------- */

/** The value's own name, for a chip with the source line under it. */
const sourceChipLabel = (
  document: EditorDocument,
  source: StepInputSource,
  stepId: string,
) => {
  const { owner, label } = describeSource(document, source, stepId);
  if (source.kind === "step-output") {
    const step = findStep(document, source.stepId)?.step;
    const outputs =
      step?.kind === "action"
        ? (getCatalogEntry(step.actionDefinitionId)?.outputs ?? [])
        : [];
    return outputs.length > 1 ? `${owner} › ${label}` : owner;
  }
  return label;
};

const ownerLook = (document: EditorDocument, source: StepInputSource) => {
  if (source.kind === "flow-input") {
    // A flow input lives on Start: Start's outline play icon.
    return {
      icon: "play" as const,
      tone: "neutral" as const,
      owner: "Start",
    };
  }
  if (source.kind === "step-output") {
    const step = findStep(document, source.stepId)?.step;
    const entry =
      step?.kind === "action"
        ? getCatalogEntry(step.actionDefinitionId)
        : undefined;
    return {
      icon: entry?.icon ?? ("rotate" as const),
      tone: entry?.tone ?? ("green" as const),
      owner: step ? stepLabel(step) : source.stepId,
    };
  }
  return null;
};

/**
 * A variable token: the DS `Chip` as Figma's `Chips` draws it (grey, round, md, `_showLeftIcon` with the source
 * step's icon). The text is step name first, a long path's middle collapsed to "…"; the hover shows the whole path.
 */
const TokenChip = ({
  source,
  stepId,
  onClick,
  onRemove,
}: {
  source: StepInputSource;
  stepId: string;
  onClick: () => void;
  onRemove: () => void;
}) => {
  const { document } = useEditor();
  const parts = tokenPath(document, source, stepId);
  return (
    <Tooltip content={parts.join(" › ")}>
      <Chip
        size="md"
        shape="round"
        color="grey"
        prefix={{
          iconName: ownerLook(document, source)?.icon ?? "rotate",
          variant: "naked",
        }}
        onClick={onClick}
        removeable={{ onRemove, "aria-label": "Clear" }}
      >
        {collapsePath(parts)}
      </Chip>
    </Tooltip>
  );
};

/** D27 A: how a value is read, under its token, only when it is read in a special way (the token names the step). */
const SourceLine = ({ source }: { source: StepInputSource }) => {
  const notes = [
    "whenMissing" in source && source.whenMissing === "skip"
      ? "Skips this step when missing"
      : null,
    "wrap" in source && source.wrap ? "As a list of one" : null,
  ].filter(Boolean);
  if (notes.length === 0) {
    return null;
  }
  return (
    <span className={css({ textStyle: "xs", color: "neutral.fg.subtle" })}>
      {notes.join(" · ")}
    </span>
  );
};

const useFieldMenu = (stepId: string, inputName: string) => {
  const { ui, setUi } = useEditor();
  const open =
    ui.openField?.stepId === stepId &&
    ui.openField.inputName === inputName &&
    ui.openField.mode === "menu";
  return {
    open,
    setOpen: (next: boolean) =>
      setUi((current) => ({
        ...current,
        openField: next ? { stepId, inputName, mode: "menu" } : null,
      })),
  };
};

/** The entity type an input names by title (`InputView.entityTypeTitle`), as a base URL. */
const entityTypeFor = (input: InputView) =>
  input.entityTypeTitle
    ? mockEntityTypes.find((type) => type.title === input.entityTypeTitle)
        ?.baseUrl
    : undefined;

/**
 * The kind a field's own control edits: its one payload kind when that kind has a control, or `Text` for an option
 * field. An input that takes several kinds (If's value) is picked from earlier steps only.
 */
const ownKind = (input: InputView) => {
  const kinds = input.kinds ?? [];
  if (input.options) {
    return "Text";
  }
  return kinds.length === 1 && isTypedKind(kinds[0]) ? kinds[0] : undefined;
};

/** A field that takes one value: its data type's control, or a reference picked from the source menu (the "@"). */
export const ValueField = ({ step, input, entry }: FieldProps) => {
  const { setDocument } = useEditor();
  const anchorRef = useRef<HTMLDivElement>(null);
  const { open, setOpen } = useFieldMenu(step.stepId, input.name);
  const source = step.inputs[input.name];
  const kinds = input.kinds ?? [];
  const typedKind = ownKind(input);

  const set = (next: StepInputSource | null) =>
    setDocument((current) =>
      setInputSource(current, step.stepId, input.name, next),
    );

  const menu = open ? (
    <SourceMenu
      anchor={anchorRef}
      stepId={step.stepId}
      input={input}
      entry={entry}
      onClose={() => setOpen(false)}
      onPick={(picked) => {
        set(picked);
        setOpen(false);
      }}
      onTypeValue={
        typedKind
          ? () => {
              set(null);
              setOpen(false);
            }
          : undefined
      }
      typedChoices={
        kinds.includes("EntityId") && !typedKind ? entityChoices() : []
      }
    />
  ) : null;

  if (source && source.kind !== "constant") {
    return (
      <div
        ref={anchorRef}
        className={css({ display: "flex", flexDirection: "column", gap: "1" })}
      >
        <TokenChip
          source={source}
          stepId={step.stepId}
          onClick={() => setOpen(true)}
          onRemove={() => set(null)}
        />
        <SourceLine source={source} />
        {menu}
      </div>
    );
  }

  if (typedKind) {
    return (
      <div
        ref={anchorRef}
        className={css({ display: "flex", gap: "1", alignItems: "flex-start" })}
      >
        <div className={css({ flex: "1", minWidth: "[0]" })}>
          <TypedValue
            kind={typedKind}
            label={input.label}
            format={input.format}
            options={input.options}
            entityTypeBaseUrl={entityTypeFor(input)}
            value={
              source?.kind === "constant" ? source.payload.value : undefined
            }
            onChange={(value) =>
              set(
                value === "" || value === null || value === undefined
                  ? null
                  : {
                      kind: "constant",
                      payload: { kind: typedKind as never, value },
                    },
              )
            }
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          iconName="at"
          aria-label={`Use a value from an earlier step for ${input.label}`}
          tooltip="Use a value from an earlier step"
          onClick={() => setOpen(true)}
        />
        {menu}
      </div>
    );
  }

  return (
    <div ref={anchorRef}>
      <Button
        size="sm"
        variant="subtle"
        iconName="plus"
        onClick={() => setOpen(true)}
      >
        Choose
      </Button>
      {menu}
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Free text with "@" chips (ledger, 12–13 Oct: a trigger symbol inserts an inline chip, found by search).
 * ------------------------------------------------------------------------------------------------------------- */

const chipClass = css({
  display: "inline-flex",
  alignItems: "center",
  paddingX: "[6px]",
  marginX: "[1px]",
  borderRadius: "sm",
  backgroundColor: "blue.bgSolid.surface.active",
  color: "blue.fg.link",
  textStyle: "xs",
  fontWeight: "medium",
  userSelect: "all",
  whiteSpace: "nowrap",
});

const editorClass = css({
  minHeight: "[60px]",
  width: "[100%]",
  paddingX: "2",
  paddingY: "[6px]",
  textStyle: "sm",
  color: "neutral.fg.heading",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle.hover",
  borderRadius: "md",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  outline: "none",
  _focus: {
    borderColor: "blue.bd.strong",
    boxShadow: "[0 0 0 2px var(--colors-blue-bd-subtle)]",
  },
  "&:empty::before": {
    content: "attr(data-placeholder)",
    color: "neutral.fg.muted.disabled",
  },
});

const renderParts = (
  element: HTMLElement,
  parts: TemplatePart[],
  label: (source: RefSource) => string,
) => {
  element.replaceChildren(
    ...parts.map((part) => {
      if (part.kind === "text") {
        return globalThis.document.createTextNode(part.text);
      }
      const chip = globalThis.document.createElement("span");
      chip.contentEditable = "false";
      chip.className = chipClass;
      chip.dataset.ref = JSON.stringify(part.source);
      chip.textContent = label(part.source);
      return chip;
    }),
  );
};

const readParts = (element: HTMLElement): TemplatePart[] => {
  const parts: TemplatePart[] = [];
  for (const node of element.childNodes) {
    if (node instanceof HTMLElement && node.dataset.ref) {
      parts.push({
        kind: "ref",
        source: JSON.parse(node.dataset.ref) as RefSource,
      });
    } else {
      const text = node.textContent ?? "";
      const last = parts.at(-1);
      if (last?.kind === "text") {
        last.text += text;
      } else {
        parts.push({ kind: "text", text });
      }
    }
  }
  return parts;
};

export const MentionField = ({ step, input, entry }: FieldProps) => {
  const { document, setDocument, ui, setUi } = useEditor();
  const editorRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const key = fieldKey(step.stepId, input.name);
  const stored = document.templates[key];
  const fallback = step.inputs[input.name];
  const parts: TemplatePart[] =
    stored ??
    (fallback
      ? fallback.kind === "constant"
        ? [{ kind: "text", text: String(fallback.payload.value) }]
        : [{ kind: "ref", source: fallback }]
      : []);
  const serialized = JSON.stringify(parts);
  const lastWritten = useRef<string | null>(null);
  const [mention, setMention] = useState<{ query: string } | null>(
    ui.openField?.stepId === step.stepId &&
      ui.openField.inputName === input.name &&
      ui.openField.mode === "mention"
      ? { query: "" }
      : null,
  );

  const label = (source: RefSource) =>
    sourceChipLabel(document, source, step.stepId);

  useEffect(() => {
    const element = editorRef.current;
    if (element && serialized !== lastWritten.current) {
      renderParts(element, JSON.parse(serialized) as TemplatePart[], label);
      lastWritten.current = serialized;
    }
  });

  const commit = () => {
    const element = editorRef.current;
    if (!element) {
      return;
    }
    const next = readParts(element);
    lastWritten.current = JSON.stringify(next);
    setDocument((current) => ({
      ...current,
      templates: { ...current.templates, [key]: next },
    }));
  };

  /** Finds "@query" just before the caret. */
  const findMention = () => {
    const selection = globalThis.getSelection();
    const node = selection?.anchorNode;
    if (!selection || !node || node.nodeType !== Node.TEXT_NODE) {
      return null;
    }
    const before = (node.textContent ?? "").slice(0, selection.anchorOffset);
    const match = /@([^@\n]{0,40})$/.exec(before);
    return match
      ? {
          node,
          start: match.index,
          end: selection.anchorOffset,
          query: match[1] ?? "",
        }
      : null;
  };

  const insert = (source: StepInputSource) => {
    const element = editorRef.current;
    if (!element || source.kind === "constant") {
      return;
    }
    const found = findMention();
    const chip = globalThis.document.createElement("span");
    chip.contentEditable = "false";
    chip.className = chipClass;
    chip.dataset.ref = JSON.stringify(source);
    chip.textContent = label(source);
    const space = globalThis.document.createTextNode(" ");
    if (found) {
      const text = found.node.textContent ?? "";
      const after = globalThis.document.createTextNode(text.slice(found.end));
      found.node.textContent = text.slice(0, found.start);
      found.node.parentNode?.insertBefore(after, found.node.nextSibling);
      found.node.parentNode?.insertBefore(space, after);
      found.node.parentNode?.insertBefore(chip, space);
    } else {
      element.append(chip, space);
    }
    setMention(null);
    setUi((current) => ({ ...current, openField: null }));
    commit();
    element.focus();
    const range = globalThis.document.createRange();
    range.setStartAfter(space);
    range.collapse(true);
    globalThis.getSelection()?.removeAllRanges();
    globalThis.getSelection()?.addRange(range);
  };

  const engineValue = parts.filter(
    (part) => part.kind === "ref" || part.text.trim() !== "",
  );
  const mixed =
    engineValue.length > 1 && engineValue.some((part) => part.kind === "ref");

  return (
    <div
      ref={fieldRef}
      className={css({ display: "flex", flexDirection: "column", gap: "1" })}
    >
      <div
        ref={editorRef}
        role="textbox"
        tabIndex={0}
        aria-multiline="true"
        aria-label={input.label}
        contentEditable
        suppressContentEditableWarning
        className={editorClass}
        data-placeholder="Type, or @ to use a value"
        onInput={() => {
          const found = findMention();
          setMention(found ? { query: found.query } : null);
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && mention) {
            event.preventDefault();
            setMention(null);
          }
        }}
      />
      {mixed ? (
        <Tooltip content="The engine takes one value per input, so text mixed with values has no engine shape yet. Kept in the prototype's mock layer.">
          <span className={mutedTextStyle}>Text with values · mock</span>
        </Tooltip>
      ) : null}
      {mention ? (
        <SourceMenu
          anchor={fieldRef}
          stepId={step.stepId}
          input={input}
          entry={entry}
          query={mention.query}
          onClose={() => {
            setMention(null);
            setUi((current) => ({ ...current, openField: null }));
          }}
          onPick={insert}
        />
      ) : null}
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * List fields (field kinds v2, F7): never raw typed items. People and entities are picked from a searchable multi
 * select; files are uploaded or picked; emails may be typed, each checked and shown as a chip; anything else comes
 * from earlier steps. "+" opens the source menu (not "@", because emails contain "@"; ledger, 12 Oct).
 * ------------------------------------------------------------------------------------------------------------- */

type ListMode = "email" | "entity" | "file" | "reference";

const listModeOf = (input: InputView): ListMode => {
  const kinds = input.kinds ?? [];
  if (input.format === "email") {
    return "email";
  }
  if (input.format === "file" || kinds.includes("PersistedEntityMetadata")) {
    return "file";
  }
  if (kinds.length === 1 && kinds[0] === "EntityId") {
    return "entity";
  }
  return "reference";
};

/** The DS input frame at `sm` (1 px border, 8 px corners), holding chips and the "+" action. */
const listFieldStyle = css({
  display: "flex",
  flexWrap: "nowrap",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
  minHeight: "[28px]",
  "& > *": { minWidth: "[0]" },
  "&[data-all]": { flexWrap: "wrap" },
  // Spec Error state: a red border with the one line under the field.
  "&[data-invalid]": { borderColor: "red.bd.strong" },
  paddingY: "[1px]",
  paddingLeft: "[1px]",
  paddingRight: "[1px]",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.solid",
  borderRadius: "lg",
  backgroundColor: "neutral.bgSolid.min",
  _hover: { borderColor: "neutral.bd.strong" },
});

/** "+N" after the first chip: hover lists the rest, click shows them all. */
const moreStyle = css({
  flexShrink: 0,
  paddingX: "1.5",
  borderRadius: "md",
  textStyle: "xs",
  fontWeight: "medium",
  color: "neutral.fg.muted",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.bg.surface.active" },
});

/** A file picked from the computer: MOCK, nothing uploads; the chip keeps its name. */
const uploadedPrefix = "upload:";

export const ListField = ({ step, input, entry }: FieldProps) => {
  const { document, setDocument } = useEditor();
  const anchorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { open, setOpen } = useFieldMenu(step.stepId, input.name);
  const [typing, setTyping] = useState("");
  const [showTyping, setShowTyping] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const key = fieldKey(step.stepId, input.name);
  const existing = step.inputs[input.name];
  const items = document.lists[key] ?? (existing ? [existing] : []);
  const kinds = input.kinds ?? [];
  const mode = listModeOf(input);
  const typeBaseUrl = entityTypeFor(input);

  const setItems = (next: StepInputSource[]) =>
    setDocument((current) => ({
      ...current,
      lists: { ...current.lists, [key]: next },
    }));

  const itemLabel = (item: StepInputSource) => {
    if (item.kind === "constant") {
      const value = String(item.payload.value);
      const known =
        mockEntities.find((candidate) => candidate.entityId === value)?.label ??
        mockFiles.find((candidate) => candidate.entityId === value)?.label ??
        mockPeopleEmails.find((candidate) => candidate.email === value)?.label;
      return known ?? value.replace(uploadedPrefix, "");
    }
    return collapsePath(tokenPath(document, item, step.stepId));
  };

  /** A typed email that fails the check stays, as a red chip (spec F7: never a silent drop). */
  const badEmail = (item: StepInputSource) =>
    mode === "email" &&
    item.kind === "constant" &&
    !isEmail(String(item.payload.value));

  const addTyped = () => {
    const address = typing.trim();
    if (!address) {
      return;
    }
    setItems([
      ...items,
      { kind: "constant", payload: { kind: "Text", value: address } },
    ]);
    setTyping("");
  };

  const constants = items.filter((item) => item.kind === "constant");
  const variables = items.filter((item) => item.kind !== "constant");
  const mixed =
    items.length > 1 && items.some((item) => item.kind !== "constant");

  const chip = (item: StepInputSource) => {
    const index = items.indexOf(item);
    const bad = badEmail(item);
    const content = (
      <Chip
        key={JSON.stringify(item)}
        size="md"
        color={bad ? "red" : "grey"}
        {...(item.kind === "constant"
          ? {}
          : {
              shape: "round" as const,
              prefix: {
                iconName: ownerLook(document, item)?.icon ?? "rotate",
                variant: "naked" as const,
              },
            })}
        removeable={{
          onRemove: () => setItems(items.filter((_, other) => other !== index)),
          "aria-label": `Remove ${itemLabel(item)}`,
        }}
      >
        {itemLabel(item)}
      </Chip>
    );
    return bad ? (
      <Tooltip key={JSON.stringify(item)} content="Not an email address">
        {content}
      </Tooltip>
    ) : (
      content
    );
  };

  const addButton = (
    <Button
      size={mode === "entity" ? "sm" : "xs"}
      variant="ghost"
      iconName="plus"
      aria-label={`Add to ${input.label}`}
      tooltip={mode === "entity" ? "Use a list from an earlier step" : "Add"}
      onClick={() => setOpen(true)}
    />
  );

  const typedChoices =
    mode === "email"
      ? mockPeopleEmails.map((person) => ({
          label: person.label,
          hint: person.email,
          source: {
            kind: "constant" as const,
            payload: { kind: "Text" as const, value: person.email },
          },
        }))
      : mode === "file"
        ? mockFiles.map((file) => ({
            label: file.label,
            source: {
              kind: "constant" as const,
              payload: { kind: "EntityId" as const, value: file.entityId },
            },
          }))
        : mode === "reference" && kinds.includes("EntityId")
          ? entityChoices()
          : [];

  return (
    <div
      className={css({ display: "flex", flexDirection: "column", gap: "1" })}
    >
      {mode === "entity" ? (
        <div
          ref={anchorRef}
          className={css({ display: "flex", gap: "1", alignItems: "center" })}
        >
          <div className={css({ flex: "1", minWidth: "[0]" })}>
            <Select
              size="sm"
              multiple
              searchable
              renderSelectedAll={firstAndMore(
                (value) =>
                  mockEntities.find((entity) => entity.entityId === value)
                    ?.label ?? value,
              )}
              aria-label={input.label}
              items={mockEntities
                .filter(
                  (candidate) =>
                    !typeBaseUrl || candidate.entityTypeBaseUrl === typeBaseUrl,
                )
                .map((candidate) => ({
                  value: candidate.entityId as string,
                  text: candidate.label,
                }))}
              value={constants.map((item) =>
                item.kind === "constant" ? String(item.payload.value) : "",
              )}
              placeholder={
                typeBaseUrl
                  ? `Choose ${(findEntityType(typeBaseUrl)?.pluralTitle ?? "entities").toLowerCase()}`
                  : "Choose entities"
              }
              onChange={(values) =>
                setItems([
                  ...variables,
                  ...values.map((value): StepInputSource => ({
                    kind: "constant",
                    payload: { kind: "EntityId", value: value as never },
                  })),
                ])
              }
            />
          </div>
          {addButton}
        </div>
      ) : null}
      {mode === "entity" ? (
        variables.length > 0 ? (
          <div
            className={css({
              display: "flex",
              flexWrap: "wrap",
              gap: "1",
              alignItems: "center",
            })}
          >
            {variables.map(chip)}
          </div>
        ) : null
      ) : (
        // Spec F7 `input_withAction`: the chips and "+" sit in one bordered sm field, 28 px when it holds one line.
        <div
          ref={anchorRef}
          className={listFieldStyle}
          data-invalid={items.some(badEmail) || undefined}
          data-all={showAll || undefined}
        >
          {/* One line: the first chip (an invalid one first), then "+N" (spec F7). */}
          {(showAll
            ? items
            : items.length > 0
              ? [items.find(badEmail) ?? items[0]!]
              : []
          ).map(chip)}
          {!showAll && items.length > 1 ? (
            <Tooltip
              content={items
                .filter((item) => item !== (items.find(badEmail) ?? items[0]))
                .map(itemLabel)
                .join(", ")}
            >
              <button
                type="button"
                className={moreStyle}
                aria-label={`Show ${items.length - 1} more`}
                onClick={() => setShowAll(true)}
              >
                +{items.length - 1}
              </button>
            </Tooltip>
          ) : null}
          {items.length === 0 ? (
            <span
              className={css({
                paddingX: "2",
                textStyle: "sm",
                color: "neutral.fg.subtle",
              })}
            >
              {mode === "email"
                ? "Add addresses"
                : mode === "file"
                  ? "Add files"
                  : "Add from earlier steps"}
            </span>
          ) : null}
          <span className={css({ marginLeft: "auto" })}>{addButton}</span>
        </div>
      )}
      {items.length === 1 && items[0]!.kind !== "constant" ? (
        <SourceLine source={items[0]!} />
      ) : null}
      {mode === "email" && showTyping ? (
        <TextInput
          size="sm"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- it opens from the user's own "Type an address" pick
          autoFocus
          value={typing}
          aria-label={`Type an address for ${input.label}`}
          placeholder="name@example.com, then Enter"
          prefix={{ iconName: "at", variant: "subtle" }}
          onChange={(value) => setTyping(value)}
          onBlur={() => {
            addTyped();
            setShowTyping(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTyped();
            } else if (event.key === "Escape") {
              setTyping("");
              setShowTyping(false);
            }
          }}
        />
      ) : null}
      {items.some(badEmail) ? (
        <span className={errorTextStyle}>Not an email address</span>
      ) : null}
      {mixed ? (
        <Tooltip content="The engine takes one source per input: a list, or one value wrapped as a list. Several sources in one list are kept in the prototype's mock layer.">
          <span className={mutedTextStyle}>Several sources · mock</span>
        </Tooltip>
      ) : null}
      {mode === "file" ? (
        <input
          ref={fileRef}
          type="file"
          hidden
          aria-label={`Upload a file to ${input.label}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              setItems([
                ...items,
                {
                  kind: "constant",
                  payload: {
                    kind: "EntityId",
                    value: `${uploadedPrefix}${file.name}` as never,
                  },
                },
              ]);
            }
            // Clears the picker, so the same file can be picked again.
            if (fileRef.current) {
              fileRef.current.value = "";
            }
          }}
        />
      ) : null}
      {open ? (
        <SourceMenu
          anchor={anchorRef}
          stepId={step.stepId}
          input={input}
          entry={entry}
          onClose={() => setOpen(false)}
          onPick={(picked) => {
            setItems([...items, picked]);
            setOpen(false);
          }}
          onTypeValue={
            mode === "email"
              ? () => {
                  setShowTyping(true);
                  setOpen(false);
                }
              : mode === "file"
                ? () => {
                    setOpen(false);
                    fileRef.current?.click();
                  }
                : undefined
          }
          typeValueLabel={
            mode === "email" ? "Type an address" : "Upload a file"
          }
          typeValueIcon={mode === "email" ? "pencil" : "file"}
          typeValueSource={mode === "file" ? "File upload" : "Manual input"}
          typedGroupLabel={
            mode === "email" ? "People" : mode === "file" ? "Files" : undefined
          }
          typedChoices={typedChoices}
        />
      ) : null}
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Query builder (Journey 3): UI only, never SQL (ledger, 20 Oct). The rows live in `condition-builder.tsx`.
 * ------------------------------------------------------------------------------------------------------------- */

/** Entity type with the same source menu: a fixed type, an earlier step, a flow input, or the graph (Journey 3, B2). */
const EntityTypeField = ({
  step,
  entry,
  draft,
  update,
}: {
  step: DraftActionStep;
  entry: CatalogEntry;
  draft: QueryDraft;
  update: (next: QueryDraft) => void;
}) => {
  const { document, ui, setUi } = useEditor();
  const anchorRef = useRef<HTMLDivElement>(null);
  const open =
    ui.openField?.stepId === step.stepId &&
    ui.openField.inputName === "entityType";
  const setOpen = (next: boolean) =>
    setUi((current) => ({
      ...current,
      openField: next
        ? { stepId: step.stepId, inputName: "entityType", mode: "menu" }
        : null,
    }));
  const typeInput: InputView = {
    name: "entityType",
    label: "Entity type",
    array: false,
    required: true,
    hasDefault: false,
    kinds: ["VersionedUrl"],
    sources: ["HASH graph @lookup", "Previous step"],
  };
  const selected = findEntityType(draft.entityTypeBaseUrl);
  const sourceLook = draft.entityTypeSource
    ? describeSource(document, draft.entityTypeSource, step.stepId)
    : null;

  return (
    <div ref={anchorRef}>
      <button
        type="button"
        className={selectTriggerStyle}
        data-placeholder={(!sourceLook && !selected) || undefined}
        onClick={() => setOpen(true)}
      >
        <span>
          {sourceLook
            ? `${sourceLook.owner} › ${sourceLook.label}`
            : (selected?.title ?? "Choose a type")}
        </span>
        <Icon name="chevronDown" size="sm" />
      </button>
      <div
        className={css({
          display: "flex",
          justifyContent: "flex-end",
          marginTop: "1.5",
        })}
      >
        <UseVariable onClick={() => setOpen(true)} />
      </div>
      {open ? (
        <SourceMenu
          anchor={anchorRef}
          stepId={step.stepId}
          input={typeInput}
          entry={entry}
          typedGroupLabel="Entity types"
          typedChoices={mockEntityTypes.map((type) => ({
            label: type.title,
            hint: type.description,
            selected:
              !draft.entityTypeSource &&
              type.baseUrl === draft.entityTypeBaseUrl,
            source: {
              kind: "constant",
              payload: { kind: "VersionedUrl", value: type.entityTypeId },
            },
          }))}
          onClose={() => setOpen(false)}
          onPick={(source) => {
            if (source.kind === "constant") {
              const type = mockEntityTypes.find(
                (candidate) => candidate.entityTypeId === source.payload.value,
              );
              update({
                entityTypeBaseUrl: type?.baseUrl,
                entityTypeSource: undefined,
                conditions:
                  type?.baseUrl === draft.entityTypeBaseUrl
                    ? draft.conditions
                    : [],
              });
            } else {
              update({ ...draft, entityTypeSource: source });
            }
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
};

/**
 * Find entities' query, or If / Filter list's condition. The Query block is stacked (key above, builder below), as
 * in Journey 3.
 */
export const QueryField = ({
  step,
  input,
  entry,
  mode,
  typeHint,
  allowVariables,
}: FieldProps & {
  mode: "query" | "condition";
  typeHint?: string;
  /** False for a trigger's condition, which has nothing earlier to refer to. */
  allowVariables?: boolean;
}) => {
  const { document, setDocument } = useEditor();
  const key = fieldKey(step.stepId, input.name);
  const draft: QueryDraft = document.queries[key] ?? { conditions: [] };
  const typeBaseUrl = mode === "query" ? draft.entityTypeBaseUrl : typeHint;
  const entityType = findEntityType(typeBaseUrl);

  const update = (next: QueryDraft) =>
    setDocument((current) => ({
      ...current,
      queries: { ...current.queries, [key]: next },
    }));

  const properties: {
    baseUrl: string;
    title: string;
    property?: MockPropertyType;
  }[] = entityType
    ? entityType.properties.map((property) => ({
        baseUrl: property.baseUrl,
        title: property.title,
        property,
      }))
    : mode === "condition"
      ? [{ baseUrl: VALUE_SUBJECT, title: "Value" }]
      : [];

  return (
    <>
      {mode === "query" ? (
        <PropertyRow
          label="Entity type"
          hover="Entity type · the kind of entity to find. At least one of Webs, Entity type or Query."
        >
          <EntityTypeField
            step={step}
            entry={entry}
            draft={draft}
            update={update}
          />
        </PropertyRow>
      ) : null}
      {mode === "query" &&
      !draft.entityTypeBaseUrl &&
      !draft.entityTypeSource &&
      draft.conditions.length === 0 ? (
        <span className={css({ gridColumn: "1 / -1" })}>
          <span className={mutedTextStyle}>
            Set at least one of Webs, Entity type or Query.
          </span>
        </span>
      ) : null}
      {/* A wide control: its label above, across both columns. */}
      <div
        className={css({
          gridColumn: "1 / -1",
          display: "flex",
          flexDirection: "column",
          gap: "2",
        })}
      >
        <span className={keyStyle}>
          {mode === "query" ? "Query" : input.label}
        </span>
        <ConditionBuilder
          step={step}
          input={input}
          entry={entry}
          draft={draft}
          properties={properties}
          forGraph={mode === "query"}
          update={update}
          allowVariables={allowVariables}
        />
      </div>
    </>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Read entity's property (#10051): a property of the entity's type, which also declares the output's kind.
 * ------------------------------------------------------------------------------------------------------------- */

export const PropertyField = ({ step, input }: FieldProps) => {
  const { document, setDocument } = useEditor();
  const typeBaseUrl = entityTypeOf(document, step.inputs.entityId, step.stepId);
  const entityType = findEntityType(typeBaseUrl);
  const source = step.inputs[input.name];
  const current =
    source?.kind === "constant"
      ? (source.payload.value as { propertyTypeBaseUrl?: string } | null)
          ?.propertyTypeBaseUrl
      : undefined;

  const groups = (entityType ? [entityType] : mockEntityTypes).map((type) => ({
    id: type.baseUrl,
    label: type.title,
    // Read entity reads plain values; links are followed with another step.
    items: type.properties
      .filter((property) => !("linksTo" in property && property.linksTo))
      .map((property) => ({
        value: property.baseUrl,
        text: entityType ? property.title : `${type.title} › ${property.title}`,
      })),
  }));

  return (
    <Select
      size="sm"
      searchable
      items={entityType ? groups[0]!.items : groups}
      value={current ?? null}
      placeholder="Choose a property"
      onChange={(value) => {
        const property = findPropertyType(value ?? undefined);
        setDocument((currentDocument) =>
          setInputSource(
            currentDocument,
            step.stepId,
            input.name,
            property
              ? {
                  kind: "constant",
                  payload: {
                    kind: "EntityProperty" as never,
                    value: {
                      kind: "entityProperty",
                      propertyTypeBaseUrl: property.baseUrl,
                      payloadKind: property.payloadKind,
                    },
                  },
                }
              : null,
          ),
        );
      }}
    />
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Update / Create entity: one row per property changed (#10060). Values may come from earlier steps, but the PR
 * takes the patches as one constant, so a referenced value has no engine shape yet.
 * ------------------------------------------------------------------------------------------------------------- */

/** One property's new value: typed, or picked from earlier steps through the same source menu. */
const PatchValue = ({
  step,
  input,
  source,
  onChange,
  entityTypeBaseUrl,
}: {
  step: DraftActionStep;
  input: InputView;
  source: StepInputSource | null;
  onChange: (source: StepInputSource | null) => void;
  /** A link property picks entities of the type it links to. */
  entityTypeBaseUrl?: string;
}) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const kind = input.kinds?.[0] ?? "Text";
  const entry = getCatalogEntry(step.actionDefinitionId)!;
  return (
    <div
      ref={anchorRef}
      className={css({ display: "flex", flexDirection: "column", gap: "1" })}
    >
      {source && source.kind !== "constant" ? (
        <>
          <TokenChip
            source={source}
            stepId={step.stepId}
            onClick={() => setOpen(true)}
            onRemove={() => onChange(null)}
          />
          <SourceLine source={source} />
        </>
      ) : (
        <div
          className={css({
            display: "flex",
            gap: "1",
            alignItems: "flex-start",
          })}
        >
          <div className={css({ flex: "1", minWidth: "[0]" })}>
            <TypedValue
              kind={kind}
              label={input.label}
              options={input.options}
              entityTypeBaseUrl={entityTypeBaseUrl}
              value={
                source?.kind === "constant" ? source.payload.value : undefined
              }
              onChange={(value) =>
                onChange(
                  value === "" || value === null || value === undefined
                    ? null
                    : {
                        kind: "constant",
                        payload: { kind: kind as never, value },
                      },
                )
              }
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            iconName="at"
            aria-label="Use a value from an earlier step"
            tooltip="Use a value from an earlier step"
            onClick={() => setOpen(true)}
          />
        </div>
      )}
      {open ? (
        <SourceMenu
          anchor={anchorRef}
          stepId={step.stepId}
          input={input}
          entry={entry}
          onClose={() => setOpen(false)}
          onPick={(picked) => {
            onChange(picked);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
};

export const PatchField = ({ step, input }: FieldProps) => {
  const { document, setDocument } = useEditor();
  const patches = document.patches[step.stepId] ?? [];
  const typeBaseUrl =
    step.actionDefinitionId === "createEntity"
      ? mockEntityTypes.find(
          (type) =>
            step.inputs.entityTypeId?.kind === "constant" &&
            type.entityTypeId === step.inputs.entityTypeId.payload.value,
        )?.baseUrl
      : entityTypeOf(document, step.inputs.entityId, step.stepId);
  const entityType = findEntityType(typeBaseUrl);
  const available = (entityType ? [entityType] : mockEntityTypes).flatMap(
    (type) => type.properties.map((property) => ({ type, property })),
  );

  const setPatches = (next: typeof patches) =>
    setDocument((current) => ({
      ...current,
      patches: { ...current.patches, [step.stepId]: next },
    }));

  const nextId = Math.max(0, ...patches.map((patch) => patch.id)) + 1;

  return (
    <div
      className={css({ display: "flex", flexDirection: "column", gap: "2" })}
    >
      {patches.map((patch) => {
        const property = findPropertyType(patch.propertyBaseUrl);
        const patchInput: InputView = {
          name: `${input.name}:${patch.id}`,
          label: property?.title ?? "Value",
          array: false,
          required: true,
          hasDefault: false,
          kinds: [property?.payloadKind ?? "Text"],
          options: property?.options?.map((option) => ({
            value: option,
            text: option,
          })),
        };
        return (
          <div
            key={patch.id}
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "1",
            })}
          >
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              })}
            >
              <span
                className={css({
                  textStyle: "xs",
                  fontWeight: "medium",
                  color: "neutral.fg.muted",
                })}
              >
                {property?.title ?? "Property"}
              </span>
              <Button
                size="xs"
                variant="ghost"
                iconName="close"
                aria-label={`Remove ${property?.title ?? "change"}`}
                tooltip="Remove"
                onClick={() =>
                  setPatches(patches.filter((other) => other.id !== patch.id))
                }
              />
            </div>
            <PatchValue
              step={step}
              input={patchInput}
              entityTypeBaseUrl={property?.linksTo}
              source={patch.source}
              onChange={(source) =>
                setPatches(
                  patches.map((other) =>
                    other.id === patch.id ? { ...other, source } : other,
                  ),
                )
              }
            />
          </div>
        );
      })}
      <Menu
        items={available.map(({ type, property }) => ({
          id: property.baseUrl,
          text: entityType
            ? property.title
            : `${type.title} › ${property.title}`,
          onClick: () =>
            setPatches([
              ...patches,
              { id: nextId, propertyBaseUrl: property.baseUrl, source: null },
            ]),
        }))}
        trigger={
          <Button size="sm" variant="ghost" iconName="plus">
            Add property
          </Button>
        }
      />
    </div>
  );
};

export const kindHover = (input: InputView, kinds: readonly string[]) =>
  `${kindLabel(kinds[0], input.array)}${
    kinds.length > 1
      ? ` (or ${kinds
          .slice(1)
          .map((kind) => kindLabel(kind))
          .join(", ")})`
      : ""
  }${input.required && !input.hasDefault ? " · required" : ""}`;

export const isFreeText = (input: InputView) =>
  !input.array &&
  input.kinds?.length === 1 &&
  input.kinds[0] === "Text" &&
  [
    "instructions",
    "context",
    "displayName",
    "query",
    "body",
    "subject",
    "prompt",
    "question",
    "userGoal",
    "relevantEntitiesPrompt",
    "reportSpecification",
    "description",
  ].includes(input.name);

export { getSourceShape };

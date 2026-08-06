import { baseKeymap } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { css, cx } from "@hashintel/ds-helpers/css";
import {
  createSchema,
  textTokenNodes,
} from "@local/hash-isomorphic-utils/prosemirror";
import {
  textBlockNodesFromTokens,
  textBlockNodeToTextTokens,
} from "@local/hash-isomorphic-utils/text";

import {
  filterStatusMentionUsers,
  nextStatusMentionIndex,
  StatusUserSuggester,
  type StatusMentionUser,
} from "./status-user-suggester";

import type { TextToken } from "@local/hash-isomorphic-utils/types";

interface MentionTrigger {
  from: number;
  search: string;
  to: number;
}

interface MentionAnchor {
  left: number;
  top: number;
}

const findMentionTrigger = (state: EditorState): MentionTrigger | null => {
  const cursor = (state.selection as TextSelection).$cursor;
  if (!cursor) {
    return null;
  }

  let text = "";
  // eslint-disable-next-line unicorn/no-array-for-each -- ProseMirror Fragment provides forEach
  cursor.parent.content.forEach((node) => {
    text += node.text ?? " ";
  });
  const beforeCursor = text.slice(0, cursor.parentOffset);
  const match = /\B@\S*$/.exec(beforeCursor);
  if (!match) {
    return null;
  }

  const parentPosition = cursor.pos - cursor.parentOffset;
  return {
    from: parentPosition + match.index,
    search: beforeCursor.slice(match.index + 1),
    to: cursor.pos,
  };
};

const editor = css({
  minH: "28",
  maxH: "56",
  overflowY: "auto",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "md",
  px: "3",
  py: "2",
  textStyle: "sm",
  color: "fg.heading",
  bg: "bgSolid.min",
  cursor: "text",
  outline: "none",
  _focus: {
    borderColor: "neutral.s80",
    outline: "[1px solid var(--colors-neutral-s80)]",
    outlineOffset: "0",
  },
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  "&:empty:before": {
    content: "attr(data-placeholder)",
    color: "fg.subtle",
    pointerEvents: "none",
  },
});
const invalidEditor = css({ borderColor: "status.error.fg.body" });
const mentionStyle = css({
  color: "fg.link",
  fontWeight: "medium",
});

export interface StatusEditorHandle {
  focus: () => void;
}

export const StatusEditor = forwardRef<
  StatusEditorHandle,
  {
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    "aria-required"?: boolean;
    members: readonly StatusMentionUser[];
    onChange: (tokens: TextToken[]) => void;
    placeholder: string;
    value: TextToken[];
  }
>(
  (
    {
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
      "aria-required": ariaRequired,
      members,
      onChange,
      placeholder,
      value,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView>(null);
    const membersRef = useRef(members);
    const onChangeRef = useRef(onChange);
    const triggerRef = useRef<MentionTrigger | null>(null);
    const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
    const [mentionAnchor, setMentionAnchor] = useState<MentionAnchor | null>(
      null,
    );
    const [activeIndex, setActiveIndex] = useState(0);
    const suggesterId = useId();
    const activeIndexRef = useRef(activeIndex);
    const initialValueRef = useRef(value);
    const initialAttributesRef = useRef({
      "aria-describedby": ariaDescribedBy ?? "",
      "aria-controls": suggesterId,
      "aria-expanded": "false",
      "aria-invalid": ariaInvalid ? "true" : "false",
      "aria-label": "Status comment",
      "aria-multiline": "true",
      "aria-required": ariaRequired ? "true" : "false",
      class: cx(editor, ariaInvalid && invalidEditor),
      "data-placeholder": placeholder,
      role: "textbox",
    });

    membersRef.current = members;
    onChangeRef.current = onChange;
    activeIndexRef.current = activeIndex;

    const matchingMembers = useMemo(
      () =>
        trigger
          ? filterStatusMentionUsers(members, trigger.search)
          : ([] as StatusMentionUser[]),
      [members, trigger],
    );
    const matchingMembersRef = useRef(matchingMembers);
    matchingMembersRef.current = matchingMembers;

    const selectMemberRef = useRef<(user: StatusMentionUser) => void>(() => {});

    useImperativeHandle(ref, () => ({
      focus: () => viewRef.current?.focus(),
    }));

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const schema = createSchema({
        doc: { content: "inline*" },
        ...textTokenNodes,
      });
      const state = EditorState.create({
        doc: schema.node(
          "doc",
          null,
          textBlockNodesFromTokens(initialValueRef.current, schema),
        ),
        schema,
        plugins: [keymap(baseKeymap)],
      });

      const view = new EditorView(container, {
        state,
        attributes: initialAttributesRef.current,
        dispatchTransaction: (transaction) => {
          const nextState = view.state.apply(transaction);
          view.updateState(nextState);
          onChangeRef.current(textBlockNodeToTextTokens(nextState.doc));

          const nextTrigger = findMentionTrigger(nextState);
          triggerRef.current = nextTrigger;
          setTrigger(nextTrigger);
          if (nextTrigger) {
            const editorRect = container.getBoundingClientRect();
            try {
              const cursorCoordinates = view.coordsAtPos(nextTrigger.to);
              const dropdownWidth = Math.min(224, window.innerWidth - 8);
              const dropdownHeight = 160;
              const top =
                cursorCoordinates.bottom + 4 + dropdownHeight <=
                window.innerHeight
                  ? cursorCoordinates.bottom + 4
                  : Math.max(4, cursorCoordinates.top - dropdownHeight - 4);
              setMentionAnchor({
                left: Math.max(
                  4,
                  Math.min(
                    cursorCoordinates.left,
                    window.innerWidth - dropdownWidth - 4,
                  ),
                ),
                top,
              });
            } catch {
              setMentionAnchor({
                left: editorRect.left,
                top: Math.min(editorRect.bottom + 4, window.innerHeight - 164),
              });
            }
          } else {
            setMentionAnchor(null);
          }
          setActiveIndex(0);
        },
        handleKeyDown: (currentView, event) => {
          const currentTrigger = triggerRef.current;
          if (currentTrigger) {
            const matches = matchingMembersRef.current;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              if (matches.length) {
                const direction = event.key === "ArrowDown" ? 1 : -1;
                setActiveIndex((currentIndex) =>
                  nextStatusMentionIndex(
                    currentIndex,
                    direction,
                    matches.length,
                  ),
                );
              }
              return true;
            }
            const activeMember = matches[activeIndexRef.current];
            if (event.key === "Enter" && activeMember) {
              selectMemberRef.current(activeMember);
              return true;
            }
            if (event.key === "Escape") {
              triggerRef.current = null;
              setTrigger(null);
              return true;
            }
          }

          if (event.key === "Enter") {
            const hardBreak = currentView.state.schema.nodes.hardBreak;
            if (hardBreak) {
              currentView.dispatch(
                currentView.state.tr.replaceSelectionWith(hardBreak.create()),
              );
              return true;
            }
          }
          return false;
        },
        nodeViews: {
          mention: (node) => {
            const element = document.createElement("span");
            const user = membersRef.current.find(
              (member) => member.entityId === node.attrs.entityId,
            );
            element.className = `status-mention ${mentionStyle}`;
            element.textContent = user ? `@${user.shortname}` : "@Unknown user";
            return { dom: element };
          },
        },
      });

      viewRef.current = view;
      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, []);

    useEffect(() => {
      viewRef.current?.setProps({
        attributes: {
          "aria-activedescendant":
            trigger && matchingMembers[activeIndex]
              ? `${suggesterId}-option-${activeIndex}`
              : "",
          "aria-controls": suggesterId,
          "aria-describedby": ariaDescribedBy ?? "",
          "aria-expanded": trigger ? "true" : "false",
          "aria-invalid": ariaInvalid ? "true" : "false",
          "aria-label": "Status comment",
          "aria-multiline": "true",
          "aria-required": ariaRequired ? "true" : "false",
          class: cx(editor, ariaInvalid && invalidEditor),
          "data-placeholder": placeholder,
          role: "textbox",
        },
      });
    }, [
      activeIndex,
      ariaDescribedBy,
      ariaInvalid,
      ariaRequired,
      matchingMembers,
      placeholder,
      suggesterId,
      trigger,
    ]);

    selectMemberRef.current = (user) => {
      const view = viewRef.current;
      const currentTrigger = triggerRef.current;
      if (!view || !currentTrigger) {
        return;
      }

      const mention = view.state.schema.nodes.mention?.create({
        entityId: user.entityId,
        mentionType: "user",
      });
      if (!mention) {
        return;
      }
      const trailingSpace = view.state.schema.text(" ");
      const transaction = view.state.tr.replaceWith(
        currentTrigger.from,
        currentTrigger.to,
        [mention, trailingSpace],
      );
      transaction.setSelection(
        TextSelection.create(
          transaction.doc,
          currentTrigger.from + mention.nodeSize + trailingSpace.nodeSize,
        ),
      );
      view.dispatch(transaction);
      view.focus();
    };

    return (
      <div>
        <div ref={containerRef} />
        {trigger && mentionAnchor && (
          <StatusUserSuggester
            activeIndex={activeIndex}
            id={suggesterId}
            anchor={mentionAnchor}
            onSelect={selectMemberRef.current}
            portalContainer={
              containerRef.current?.closest(".hash-ds-root") ?? document.body
            }
            search={trigger.search}
            users={members}
          />
        )}
      </div>
    );
  },
);

StatusEditor.displayName = "StatusEditor";

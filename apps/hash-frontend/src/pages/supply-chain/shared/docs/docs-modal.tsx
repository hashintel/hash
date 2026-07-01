import { Portal } from "@ark-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, usePortalContainerRef } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { useSupplierPerformanceEnabled } from "../feature-flags";
import { DOC_SECTIONS } from "./docs-modal/docs-content";
import { DocEntryBlock, DocsNavProvider } from "./docs-primitives";

import type {
  DocEntry,
  DocSectionDef,
  DocSectionId,
  DocTarget,
} from "./docs-types";

const backdrop = css({
  position: "fixed",
  inset: "0",
  zIndex: "[1000]",
  bg: "neutral.a80",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  p: "4",
});
const panel = css({
  display: "flex",
  flexDirection: "column",
  w: "[min(1040px,100%)]",
  h: "[min(82vh,760px)]",
  bg: "bgSolid.min",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
  boxShadow: "2xl",
  overflow: "hidden",
});
const headerBar = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  px: "5",
  py: "3",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderColor: "bd.subtle",
  flexShrink: "0",
});
const headerTitle = css({
  fontFamily: "display",
  textStyle: "lg",
  fontWeight: "medium",
  color: "fg.heading",
});
const bodyRow = css({ display: "flex", flex: "1", minH: "0" });
const sidebar = css({
  w: "[248px]",
  flexShrink: "0",
  borderRightWidth: "1px",
  borderRightStyle: "solid",
  borderColor: "bd.subtle",
  overflowY: "auto",
  py: "3",
  // Subtle top-down gradient (white -> faint cool tint) reads less flat than a solid grey panel.
  bg: "[linear-gradient(180deg,#ffffff_0%,#f4f6fa_100%)]",
  "@media (max-width: 640px)": { display: "none" },
});
const navSection = css({ "&:not(:first-child)": { mt: "2" } });
const navSectionButton = css({
  display: "block",
  w: "full",
  textAlign: "left",
  px: "4",
  py: "1.5",
  textStyle: "sm",
  fontWeight: "semibold",
  color: "fg.heading",
  cursor: "pointer",
  bg: "[transparent]",
  border: "none",
  _hover: { color: "fg.muted" },
});
const navSectionButtonActive = css({ color: "fg.heading" });
const navEntry = css({
  display: "block",
  w: "full",
  textAlign: "left",
  pl: "6",
  pr: "4",
  py: "1",
  textStyle: "sm",
  color: "fg.subtle",
  cursor: "pointer",
  bg: "[transparent]",
  border: "none",
  borderLeftWidth: "2px",
  borderLeftStyle: "solid",
  borderLeftColor: "[transparent]",
  _hover: { color: "fg.muted" },
});
const navEntryActive = css({
  color: "fg.heading",
  fontWeight: "medium",
  borderLeftColor: "fg.heading",
});
const content = css({
  flex: "1",
  minW: "0",
  overflowY: "auto",
  px: "6",
  py: "5",
});
const sectionHeading = css({
  fontFamily: "display",
  textStyle: "2xl",
  fontWeight: "medium",
  color: "fg.heading",
  mb: "4",
});

function visibleEntries(
  section: DocSectionDef,
  supplierEnabled: boolean,
): DocEntry[] {
  return section.entries.filter(
    (event) => !event.supplierFlagGated || supplierEnabled,
  );
}

/** Resolve which entry in a section owns a given anchor sub-id. */
function entryIdForSub(
  section: DocSectionDef,
  sub: string | undefined,
): string | undefined {
  if (!sub) {
    return undefined;
  }
  const match = section.entries.find(
    (event) => event.id === sub || sub.startsWith(`${event.id}-`),
  );
  return match?.id;
}

export const DocsModal = ({
  initialTarget,
  onClose,
}: {
  initialTarget: DocTarget;
  onClose: () => void;
}) => {
  const portalRef = usePortalContainerRef();
  const supplierEnabled = useSupplierPerformanceEnabled();
  const contentRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(
    () =>
      DOC_SECTIONS.map((step) => ({
        section: step,
        entries: visibleEntries(step, supplierEnabled),
      })),
    [supplierEnabled],
  );

  const [activeSection, setActiveSection] = useState<DocSectionId>(
    initialTarget.section,
  );
  const [activeEntryId, setActiveEntryId] = useState<string | undefined>(() => {
    const step = DOC_SECTIONS.find(
      (xValue) => xValue.id === initialTarget.section,
    );
    return step ? entryIdForSub(step, initialTarget.sub) : undefined;
  });
  // The scroll target carries a nonce so re-selecting the same anchor (e.g.
  // clicking the same sidebar entry twice) still re-triggers the scroll effect.
  const [scrollTarget, setScrollTarget] = useState<{
    sub?: string;
    nonce: number;
  }>({
    sub: initialTarget.sub,
    nonce: 0,
  });

  const navigate = useCallback((target: DocTarget) => {
    setActiveSection(target.section);
    const step = DOC_SECTIONS.find((xValue) => xValue.id === target.section);
    setActiveEntryId(step ? entryIdForSub(step, target.sub) : undefined);
    setScrollTarget((prev) => ({ sub: target.sub, nonce: prev.nonce + 1 }));
  }, []);

  // Scroll to the requested anchor after the active section has rendered. Keyed
  // off `scrollTarget` only: its nonce changes on every navigation, so this also
  // fires when the section switches (navigation always updates both at once).
  useEffect(() => {
    const container = contentRef.current;
    if (!container) {
      return;
    }
    const { sub } = scrollTarget;
    if (!sub) {
      container.scrollTo({ top: 0 });
      return;
    }
    const id = requestAnimationFrame(() => {
      const el = container.querySelector(`[id="${sub}"]`);
      if (el) {
        el.scrollIntoView({ block: "start", behavior: "smooth" });
      } else {
        container.scrollTo({ top: 0 });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [scrollTarget]);

  // Scroll-spy: highlight the entry occupying the largest visible area in the
  // modal viewport. This is more reliable than "heading crossed the top",
  // because short final entries often cannot physically scroll to the top.
  useEffect(() => {
    const container = contentRef.current;
    if (!container) {
      return;
    }
    const entryIds = (
      sections.find((step) => step.section.id === activeSection)?.entries ?? []
    ).map((event) => event.id);
    if (entryIds.length === 0) {
      return;
    }
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const containerRect = container.getBoundingClientRect();
        let current = entryIds[0];
        let bestVisible = -1;

        for (const id of entryIds) {
          const el = container.querySelector(`[id="${id}"]`);
          if (!el) {
            continue;
          }
          const rect = el.getBoundingClientRect();
          const visibleTop = Math.max(rect.top, containerRect.top);
          const visibleBottom = Math.min(rect.bottom, containerRect.bottom);
          const visible = Math.max(0, visibleBottom - visibleTop);
          if (visible > bestVisible) {
            bestVisible = visible;
            current = id;
          }
        }

        setActiveEntryId((prev) => (prev === current ? prev : current));
      });
    };
    container.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      container.removeEventListener("scroll", update);
      cancelAnimationFrame(raf);
    };
  }, [sections, activeSection]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const active =
    sections.find((step) => step.section.id === activeSection) ?? sections[0];
  if (!active) {
    return null;
  }

  return (
    <Portal container={portalRef}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: The backdrop is pointer-only; Escape is handled globally above. */}
      <div
        className={backdrop}
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        {/* biome-ignore lint/a11y/useSemanticElements: Native <dialog> positioning conflicts with the portal/backdrop layout. */}
        <div
          className={panel}
          role="dialog"
          aria-modal="true"
          aria-label="Documentation"
        >
          <div className={headerBar}>
            <h2 className={headerTitle}>Documentation</h2>
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              iconName="close"
              aria-label="Close documentation"
              onClick={onClose}
            />
          </div>
          <div className={bodyRow}>
            <nav className={sidebar} aria-label="Documentation sections">
              {sections.map(({ section, entries }) => (
                <div key={section.id} className={navSection}>
                  <button
                    type="button"
                    className={cx(
                      navSectionButton,
                      section.id === activeSection && navSectionButtonActive,
                    )}
                    onClick={() =>
                      navigate({ section: section.id, sub: entries[0]?.id })
                    }
                  >
                    {section.title}
                  </button>
                  {entries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={cx(
                        navEntry,
                        section.id === activeSection &&
                          entry.id === activeEntryId &&
                          navEntryActive,
                      )}
                      onClick={() =>
                        navigate({ section: section.id, sub: entry.id })
                      }
                    >
                      {entry.title}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <div className={content} ref={contentRef}>
              <DocsNavProvider navigate={navigate}>
                <h2 className={sectionHeading}>{active.section.title}</h2>
                {active.entries.map((entry) => (
                  <DocEntryBlock
                    key={entry.id}
                    id={entry.id}
                    title={entry.title}
                  >
                    {entry.render()}
                  </DocEntryBlock>
                ))}
              </DocsNavProvider>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
};

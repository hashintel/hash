import { useRef, useState } from "react";
import {
  PiGauge,
  PiLightning,
  PiMagnifyingGlass,
  PiPower,
  PiStack,
} from "react-icons/pi";

import { Button, Popover } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  countInterviewReplies,
  getInterviewBudget,
  interviewBudgetLabel,
  interviewBudgetLevels,
  interviewBudgetLevelsConfig,
  type InterviewBudgetLevel,
} from "../../../shared/interview-budget";

import type { PetrinautAiComposerControlContext } from "@hashintel/petrinaut/ui";

const icons = {
  off: PiPower,
  quick: PiLightning,
  standard: PiGauge,
  thorough: PiMagnifyingGlass,
  deep: PiStack,
};
// Host colors override the library's separately compiled Button utility layer.
const levelStyle = {
  off: css({
    color: "neutral.fg.body !important",
    backgroundColor: "neutral.bgSolid.surface !important",
    borderColor: "neutral.bd.subtle !important",
  }),
  quick: css({
    color: "yellow.fg.body !important",
    backgroundColor: "yellow.bgSolid.subtle !important",
    borderColor: "yellow.bd.subtle !important",
  }),
  standard: css({
    color: "blue.fg.body !important",
    backgroundColor: "blue.bgSolid.subtle !important",
    borderColor: "blue.bd.subtle !important",
  }),
  thorough: css({
    color: "green.fg.body !important",
    backgroundColor: "green.bgSolid.subtle !important",
    borderColor: "green.bd.subtle !important",
  }),
  deep: css({
    color: "purple.fg.body !important",
    backgroundColor: "purple.bgSolid.subtle !important",
    borderColor: "purple.bd.subtle !important",
  }),
};

export const InterviewBudgetControl = ({
  level,
  onChange,
}: {
  level: InterviewBudgetLevel;
  onChange: (level: InterviewBudgetLevel) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<InterviewBudgetLevel | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const config = interviewBudgetLevelsConfig[level];
  const CurrentIcon = icons[level];
  const selectedIndex = interviewBudgetLevels.indexOf(level);
  const preview = interviewBudgetLevelsConfig[hovered ?? level];

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        shape="round"
        className={`${css({ flexShrink: 0 })} ${levelStyle[level]}`}
        aria-label={`Interview budget: ${config.name} · ${config.guide}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        tooltip={`${config.name} · ${config.guide}`}
        prefix={<CurrentIcon size={16} />}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <Popover
          triggerRef={triggerRef}
          position="top-end"
          gapY={8}
          onClose={() => setOpen(false)}
        >
          <Popover.Container
            className={css({
              width: "[340px]",
              maxWidth: "[calc(100vw - 24px)]",
              backgroundColor: "neutral.s00",
            })}
          >
            <Popover.Body>
              <div
                role="group"
                aria-label="Interview budget"
                className={css({
                  display: "flex",
                  flexDirection: "column",
                  gap: "3",
                })}
              >
                <div
                  className={css({
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "sm",
                  })}
                >
                  <strong>Interview budget</strong>
                  <span className={css({ color: "neutral.fg.body" })}>
                    {preview.guide}
                  </span>
                </div>
                <div onMouseLeave={() => setHovered(null)}>
                  <div
                    className={css({
                      position: "relative",
                      height: "[36px]",
                      marginX: "[10%]",
                      _focusWithin: {
                        outline: "[2px solid token(colors.blue.s80)]",
                        outlineOffset: "[4px]",
                        borderRadius: "full",
                      },
                    })}
                  >
                    <div
                      aria-hidden="true"
                      className={css({
                        position: "absolute",
                        top: "[16px]",
                        width: "full",
                        height: "[4px]",
                        borderRadius: "full",
                        backgroundColor: "neutral.s20",
                      })}
                    />
                    <div
                      aria-hidden="true"
                      className={css({
                        position: "absolute",
                        top: "[16px]",
                        height: "[4px]",
                        borderRadius: "full",
                        backgroundColor: "neutral.s90",
                        transition: "[width 160ms ease]",
                        _motionReduce: { transition: "[none]" },
                      })}
                      style={{ width: `${selectedIndex * 25}%` }}
                    />
                    {interviewBudgetLevels.map((stop, index) => (
                      <span
                        key={stop}
                        aria-hidden="true"
                        className={css({
                          position: "absolute",
                          top: "[14px]",
                          width: "[8px]",
                          height: "[8px]",
                          borderRadius: "full",
                          backgroundColor: "neutral.s50",
                          transform: "[translateX(-50%)]",
                        })}
                        style={{ left: `${index * 25}%` }}
                      />
                    ))}
                    <span
                      aria-hidden="true"
                      className={css({
                        position: "absolute",
                        top: "[2px]",
                        width: "[32px]",
                        height: "[32px]",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "full",
                        color: "neutral.s00",
                        backgroundColor: "neutral.fg.heading",
                        transform: "[translateX(-50%)]",
                        transition: "[left 160ms ease]",
                        _motionReduce: { transition: "[none]" },
                      })}
                      style={{ left: `${selectedIndex * 25}%` }}
                    >
                      <CurrentIcon size={16} />
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={4}
                      step={1}
                      value={selectedIndex}
                      aria-label="Interview budget level"
                      aria-valuetext={`${config.name} · ${config.guide}`}
                      className={css({
                        position: "absolute",
                        inset: "[0 -16px]",
                        width: "[calc(100% + 32px)]",
                        margin: "0",
                        opacity: "0",
                        cursor: "pointer",
                      })}
                      onChange={(event) => {
                        const next =
                          interviewBudgetLevels[
                            Number(event.currentTarget.value)
                          ];
                        if (next) {
                          setHovered(null);
                          onChange(next);
                        }
                      }}
                    />
                  </div>
                  <div
                    className={css({
                      display: "grid",
                      gridTemplateColumns: "[repeat(5, 1fr)]",
                      marginTop: "1",
                    })}
                  >
                    {interviewBudgetLevels.map((stop) => (
                      <button
                        key={stop}
                        type="button"
                        aria-pressed={level === stop}
                        onMouseEnter={() => setHovered(stop)}
                        onFocus={() => setHovered(stop)}
                        onBlur={() => setHovered(null)}
                        onClick={() => onChange(stop)}
                        className={css({
                          cursor: "pointer",
                          paddingY: "1",
                          fontSize: "xs",
                          color: "neutral.fg.body",
                          borderRadius: "sm",
                          '&[aria-pressed="true"]': {
                            color: "neutral.fg.heading",
                            fontWeight: "semibold",
                          },
                          _hover: { backgroundColor: "neutral.s10" },
                        })}
                      >
                        {interviewBudgetLevelsConfig[stop].name}
                      </button>
                    ))}
                  </div>
                </div>
                <p
                  className={css({
                    fontSize: "xs",
                    color: "neutral.fg.body",
                    margin: "0",
                    minHeight: "[18px]",
                  })}
                >
                  {preview.description}
                </p>
              </div>
            </Popover.Body>
          </Popover.Container>
        </Popover>
      )}
    </>
  );
};

export const InterviewBudgetPill = ({
  level,
  context,
}: {
  level: InterviewBudgetLevel;
  context: PetrinautAiComposerControlContext;
}) => {
  const asked = countInterviewReplies(context.messages);
  const mode = context.inputMode ?? "text";
  const label = interviewBudgetLabel(level, mode, asked);
  const budget = getInterviewBudget(level, mode, asked);
  if (!budget || label === null) return null;
  const config = interviewBudgetLevelsConfig[level];
  const detail = `${config.name} · ${config.guide}. ${asked} replies counted; ${budget.questionCap ?? "no"} question cap in ${mode}; ${budget.remaining ?? "unlimited"} left. ${budget.questionCap === null ? "Pause between topics." : "At the cap, wrap up with facts, assumptions and open items; gaps stay open."} This is an estimate, not a countdown.`;
  return (
    <div className={css({ paddingX: "3", paddingBottom: "2", flexShrink: 0 })}>
      <span
        role="status"
        title={detail}
        className={`${css({ display: "inline-flex", borderRadius: "full", borderWidth: "[1px]", borderStyle: "solid", paddingX: "2", paddingY: "1", fontSize: "xs", fontVariantNumeric: "tabular-nums" })} ${levelStyle[level]}`}
      >
        {label}
      </span>
    </div>
  );
};

import { useEffect, useRef, useState } from "react";
import {
  PiGauge,
  PiLightning,
  PiMagnifyingGlass,
  PiPower,
  PiStack,
} from "react-icons/pi";

import { BaseTooltip, Button, Popover } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  getInterviewBudget,
  interviewBudgetLabel,
  interviewBudgetLevels,
  interviewBudgetLevelsConfig,
  type InterviewBudgetLevel,
} from "../../../shared/interview-budget";

import type { PetrinautAiComposerControlContext } from "@hashintel/petrinaut/ui";

const lastStop = interviewBudgetLevels.length - 1;
const stopPercent = (index: number) => (index / lastStop) * 100;

const icons = {
  off: PiPower,
  quick: PiLightning,
  standard: PiGauge,
  thorough: PiMagnifyingGlass,
  deep: PiStack,
};
const levelTheme = {
  off: css({
    "--budget-color": "token(colors.neutral.s100)",
    "--budget-tint": "token(colors.neutral.a10)",
  }),
  quick: css({
    "--budget-color": "token(colors.orange.s90)",
    "--budget-tint": "token(colors.orange.a20)",
  }),
  standard: css({
    "--budget-color": "token(colors.blue.s90)",
    "--budget-tint": "token(colors.blue.a20)",
  }),
  thorough: css({
    "--budget-color": "token(colors.green.s90)",
    "--budget-tint": "token(colors.green.a20)",
  }),
  deep: css({
    "--budget-color": "token(colors.purple.s90)",
    "--budget-tint": "token(colors.purple.a20)",
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
  const sliderRef = useRef<HTMLInputElement>(null);
  // Toggling `disableTooltip` remounts the trigger, so the Popover's own focus
  // return lands on a detached button. Restore it after an Escape dismissal.
  const refocusTrigger = useRef(false);
  useEffect(() => {
    if (open || !refocusTrigger.current) return;
    refocusTrigger.current = false;
    triggerRef.current?.focus();
  }, [open]);
  const config = interviewBudgetLevelsConfig[level];
  const CurrentIcon = icons[level];
  const selectedIndex = interviewBudgetLevels.indexOf(level);
  const previewLevel = hovered ?? level;
  const preview = interviewBudgetLevelsConfig[previewLevel];

  return (
    <span
      className={`${css({ display: "inline-flex", flexShrink: 0 })} ${levelTheme[level]}`}
    >
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        shape="round"
        className={css({
          position: "relative",
          width: "[28px]",
          height: "[28px]",
          minWidth: "[28px !important]",
          padding: "[0 !important]",
          // The library and host compile separate CSS layers.
          border: "[0 !important]",
          color: "var(--budget-color) !important",
          backgroundColor: "var(--budget-tint) !important",
          transition: "[background-color 260ms ease-out, color 260ms ease-out]",
          '&[data-budget-level="off"]': {
            backgroundColor: "[transparent !important]",
            color: "neutral.s80 !important",
            boxShadow: "[inset 0 0 0 1px token(colors.neutral.a40)]",
          },
          _hover: { filter: "[saturate(1.15) brightness(0.97)]" },
          _motionReduce: {
            transition: "[none]",
          },
        })}
        data-budget-level={level}
        aria-label={`Interview length: ${config.name} · ${config.guide}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        tooltip={`Interview length · ${config.name}`}
        tooltipOptions={{ disableTooltip: open }}
        prefix={<CurrentIcon size={15} />}
        onClick={() => {
          setHovered(null);
          setOpen(!open);
        }}
      />
      {open && (
        <Popover
          triggerRef={triggerRef}
          initialFocusRef={sliderRef}
          position="top-start"
          gapY={10}
          onClose={() => setOpen(false)}
        >
          <div
            role="group"
            aria-label="Interview length"
            onKeyDown={(event) => {
              if (event.key === "Escape") refocusTrigger.current = true;
            }}
            onMouseLeave={() => setHovered(null)}
            className={`${levelTheme[level]} ${css({
              width: "[324px]",
              maxWidth: "[calc(100vw - 24px)]",
              padding: "[14px 16px 12px]",
              border: "[1px solid token(colors.neutral.a20)]",
              borderRadius: "[16px]",
              backgroundColor: "neutral.s00",
              boxShadow:
                "[0 0 0 1px token(colors.neutral.a05), 0 2px 6px token(colors.neutral.a10), 0 12px 32px token(colors.neutral.a20)]",
            })}`}
          >
            <div
              className={css({
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "2",
                marginBottom: "[14px]",
              })}
            >
              <span
                className={css({
                  fontSize: "xs",
                  fontWeight: "semibold",
                  letterSpacing: "[0.02em]",
                  textTransform: "uppercase",
                  color: "neutral.s100",
                })}
              >
                Interview length
              </span>
              <span
                className={css({
                  fontSize: "[13px]",
                  fontWeight: "semibold",
                  color: "var(--budget-color)",
                  whiteSpace: "nowrap",
                })}
              >
                {config.name}
                <small
                  className={css({
                    color: "neutral.s80",
                    fontSize: "xs",
                    fontWeight: "medium",
                    marginLeft: "[5px]",
                  })}
                >
                  {config.guide}
                </small>
              </span>
            </div>
            <div
              className={css({
                position: "relative",
                height: "[32px]",
                marginX: "[2px]",
              })}
            >
              <div
                aria-hidden="true"
                className={css({
                  position: "absolute",
                  left: "[14px]",
                  right: "[14px]",
                  top: "[13px]",
                  height: "[6px]",
                  borderRadius: "[3px]",
                  backgroundColor: "neutral.a15",
                  overflow: "hidden",
                })}
              >
                <div
                  className={css({
                    height: "full",
                    borderRadius: "[3px]",
                    background:
                      "[linear-gradient(90deg, color-mix(in srgb, var(--budget-color) 35%, transparent), var(--budget-color))]",
                    transition:
                      "[width 380ms cubic-bezier(0.34, 1.3, 0.64, 1)]",
                    _motionReduce: { transition: "[none]" },
                  })}
                  style={{ width: `${stopPercent(selectedIndex)}%` }}
                />
              </div>
              <div
                aria-hidden="true"
                className={css({
                  position: "absolute",
                  left: "[14px]",
                  right: "[14px]",
                  top: "[16px]",
                  pointerEvents: "none",
                })}
              >
                {interviewBudgetLevels.map((stop, index) => (
                  <span
                    key={stop}
                    data-filled={index < selectedIndex || undefined}
                    className={css({
                      position: "absolute",
                      top: "[-1.5px]",
                      width: "[3px]",
                      height: "[3px]",
                      marginLeft: "[-1.5px]",
                      borderRadius: "full",
                      backgroundColor: "neutral.a40",
                      "&[data-filled]": { backgroundColor: "white.a80" },
                    })}
                    style={{ left: `${stopPercent(index)}%` }}
                  />
                ))}
              </div>
              <input
                ref={sliderRef}
                type="range"
                min={0}
                max={lastStop}
                step={1}
                value={selectedIndex}
                aria-label="Interview length"
                aria-valuetext={`${config.name} · ${config.guide}`}
                className={css({
                  position: "absolute",
                  inset: "[0]",
                  width: "full",
                  height: "full",
                  margin: "0",
                  appearance: "none",
                  background: "[transparent]",
                  cursor: "pointer",
                  _focusVisible: { outline: "[none]" },
                  "&::-webkit-slider-runnable-track": {
                    height: "[32px]",
                    background: "[transparent]",
                  },
                  "&::-webkit-slider-thumb": {
                    appearance: "none",
                    width: "[28px]",
                    height: "[28px]",
                    marginTop: "[2px]",
                    background: "[transparent]",
                    border: "[0]",
                  },
                  "&::-moz-range-track": {
                    height: "[32px]",
                    background: "[transparent]",
                  },
                  "&::-moz-range-thumb": {
                    width: "[28px]",
                    height: "[28px]",
                    background: "[transparent]",
                    border: "[0]",
                  },
                  "&:focus-visible + span": {
                    boxShadow:
                      "[0 0 0 3px token(colors.neutral.s00), 0 0 0 5px token(colors.blue.s90)]",
                  },
                  "&:hover + span, &:active + span": {
                    transform: "[scale(1.06)]",
                  },
                })}
                onMouseMove={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const position = Math.max(
                    0,
                    Math.min(
                      1,
                      (event.clientX - bounds.left - 14) / (bounds.width - 28),
                    ),
                  );
                  setHovered(
                    interviewBudgetLevels[Math.round(position * lastStop)] ??
                      level,
                  );
                }}
                onChange={(event) => {
                  const next =
                    interviewBudgetLevels[Number(event.currentTarget.value)];
                  if (next) {
                    setHovered(null);
                    onChange(next);
                  }
                }}
              />
              <span
                aria-hidden="true"
                className={css({
                  position: "absolute",
                  top: "[2px]",
                  width: "[28px]",
                  height: "[28px]",
                  marginLeft: "[-14px]",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "full",
                  pointerEvents: "none",
                  color: "white",
                  backgroundColor: "var(--budget-color)",
                  boxShadow:
                    "[0 0 0 3px token(colors.neutral.s00), 0 2px 6px token(colors.neutral.a40), 0 6px 16px color-mix(in srgb, var(--budget-color) 28%, transparent)]",
                  transition:
                    "[left 380ms cubic-bezier(0.34, 1.3, 0.64, 1), transform 160ms ease-out, background-color 260ms ease-out, box-shadow 260ms ease-out]",
                  _motionReduce: { transition: "[none]" },
                })}
                style={{
                  left: `calc(14px + (100% - 28px) * ${selectedIndex / lastStop})`,
                }}
              >
                <CurrentIcon size={14} />
              </span>
            </div>
            <div
              className={css({
                position: "relative",
                height: "[18px]",
                margin: "[8px 16px 0]",
              })}
            >
              {interviewBudgetLevels.map((stop, index) => (
                <button
                  key={stop}
                  type="button"
                  aria-pressed={level === stop}
                  onMouseEnter={() => setHovered(stop)}
                  onFocus={() => setHovered(stop)}
                  onBlur={() => setHovered(null)}
                  onClick={() => {
                    setHovered(null);
                    onChange(stop);
                  }}
                  style={{ left: `${stopPercent(index)}%` }}
                  className={css({
                    position: "absolute",
                    top: "[0]",
                    transform: "[translateX(-50%)]",
                    padding: "[0 4px]",
                    cursor: "pointer",
                    fontSize: "[11.5px]",
                    fontWeight: "medium",
                    color: "neutral.s80",
                    whiteSpace: "nowrap",
                    borderRadius: "sm",
                    '&[aria-pressed="true"]': {
                      color: "var(--budget-color) !important",
                      fontWeight: "semibold !important",
                    },
                    _hover: { color: "neutral.s115" },
                  })}
                >
                  {interviewBudgetLevelsConfig[stop].name}
                </button>
              ))}
            </div>
            <p
              className={css({
                fontSize: "xs",
                lineHeight: "[1.45]",
                color: "neutral.s100",
                margin: "[12px 0 0]",
                minHeight: "[18px]",
              })}
            >
              {previewLevel !== level && (
                <>
                  <strong
                    className={`${levelTheme[previewLevel]} ${css({ color: "var(--budget-color)", fontWeight: "semibold" })}`}
                  >
                    {preview.name}:
                  </strong>{" "}
                </>
              )}
              {preview.description}
            </p>
          </div>
        </Popover>
      )}
    </span>
  );
};

export const InterviewBudgetNote = ({
  level,
}: {
  level: InterviewBudgetLevel;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const CurrentIcon = icons[level];
  const config = interviewBudgetLevelsConfig[level];
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = ref.current?.animate(
      [
        { opacity: 0.6, transform: "translateY(2px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 180, easing: "ease-out" },
    );
    return () => animation?.cancel();
  }, []);
  return (
    <div
      ref={ref}
      className={`${levelTheme[level]} ${css({ display: "flex", alignItems: "center", gap: "2", paddingX: "3", paddingY: "0.5", fontSize: "[11px]", lineHeight: "[16px]", color: "var(--budget-color)" })}`}
    >
      <CurrentIcon
        size={12}
        aria-hidden="true"
        className={css({ flexShrink: 0 })}
      />
      <span className={css({ srOnly: true })}>
        Interview length changed to{" "}
      </span>
      <span className={css({ fontWeight: "medium" })}>{config.name}</span>
      {level !== "off" && (
        <span className={css({ color: "neutral.fg.body" })}>
          {" "}
          · {config.guide}
        </span>
      )}
    </div>
  );
};

export const InterviewBudgetPill = ({
  level,
  context,
  asked,
}: {
  level: InterviewBudgetLevel;
  context: PetrinautAiComposerControlContext;
  asked: number;
}) => {
  const mode = context.inputMode ?? "text";
  const budget = getInterviewBudget(level, mode, asked);
  // Keep the same footprint as the estimate, including its bottom padding.
  if (!budget || asked === 0)
    return (
      <div
        aria-hidden="true"
        data-budget-placeholder
        className={css({ height: "[26.5px]", flexShrink: 0 })}
      />
    );
  const config = interviewBudgetLevelsConfig[level];
  const label = interviewBudgetLabel(level, mode, asked) ?? "";
  const nearCap = budget.remaining !== null && budget.remaining <= 1;
  const mechanism =
    budget.questionCap === null
      ? `${asked} asked · no cap`
      : `${budget.questionCap} questions · ${asked} asked · ${budget.remaining} left`;
  const note =
    budget.questionCap === null
      ? "Brunch offers pauses between topics, with no question limit."
      : budget.remaining === 0
        ? "Question limit reached. Wrap-up lists open items."
        : budget.remaining === 1
          ? "Wrap-up follows your answer to the final question; open items stay listed."
          : "An estimate, not a countdown.";
  return (
    <div
      className={css({
        display: "flex",
        justifyContent: "flex-end",
        paddingX: "4",
        paddingBottom: "[10px]",
        flexShrink: 0,
      })}
    >
      <BaseTooltip
        position="top-end"
        openDelay="fast"
        closeDelay="fast"
        content={
          <div
            className={css({
              width: "[232px]",
              padding: "[10px 12px]",
              borderRadius: "[10px]",
              backgroundColor: "neutral.s120",
              color: "neutral.s30",
              fontSize: "[11.5px]",
              fontWeight: "medium",
              lineHeight: "[1.5]",
            })}
          >
            <p className={css({ margin: "0" })}>
              <b
                className={css({
                  display: "block",
                  color: "neutral.s00",
                  fontWeight: "semibold",
                })}
              >
                {config.name} · {config.guide}
              </b>
              {mechanism}
            </p>
            <p className={css({ margin: "[6px 0 0]" })}>
              Each Brunch reply before wrap-up counts as one question.
            </p>
            <p
              className={css({
                margin: "[6px 0 0]",
                paddingTop: "[6px]",
                borderTop: "[1px solid token(colors.neutral.s100)]",
              })}
            >
              {note}
            </p>
          </div>
        }
      >
        <span
          role="status"
          data-near-cap={nearCap || undefined}
          className={css({
            display: "inline-flex",
            justifyContent: "flex-end",
            minWidth: "[132px]",
            fontSize: "[11px]",
            fontWeight: "semibold",
            lineHeight: "[1.5]",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            color: "neutral.s80",
            borderRadius: "[4px]",
            cursor: "default",
            transition: "[color 300ms ease-out]",
            "&[data-near-cap]": { color: "orange.s90 !important" },
            _motionReduce: { transition: "[none]" },
          })}
        >
          {label}
        </span>
      </BaseTooltip>
    </div>
  );
};

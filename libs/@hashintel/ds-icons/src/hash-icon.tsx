import { createContext, use } from "react";

import { AddNodeGeometry } from "./hash-icon/add-node-geometry";
import { additionalGeometry } from "./hash-icon/additional-geometry";
import { explorationGeometry } from "./hash-icon/exploration-geometry";
import { FilledShape, IconFillContext } from "./hash-icon/filled-shape";
import { IconInteraction } from "./hash-icon/interaction";
import { keycapGeometry } from "./hash-icon/keycap-geometry";
import { libraryGeometry } from "./hash-icon/library-geometry";
import { logicGeometry } from "./hash-icon/logic-geometry";
import { McpServerGeometry } from "./hash-icon/mcp-server-geometry";
import { modelingGeometry } from "./hash-icon/modeling-geometry";
import {
  hashIconEffects,
  getIconTransition,
  resolveIconDuration,
  useIconEffects,
  useIconMotionAllowed,
} from "./hash-icon/motion";
import { ParameterGeometry } from "./hash-icon/parameter-geometry";
import { SettingsGeometry } from "./hash-icon/settings-geometry";
import { ShapesGeometry } from "./hash-icon/shapes-geometry";
import { IconMotionLayer } from "./hash-icon/shared/icon-motion-layer";
import { SidebarGeometry } from "./hash-icon/sidebar-geometry";
import { FlaskGeometry, LayerGeometry } from "./hash-icon/simulation-geometry";
import {
  DiagnosticsGeometry,
  MenuGeometry,
  MicrophoneGeometry,
  PauseGeometry,
  PlaybackGeometry,
} from "./hash-icon/state-geometry";
import { utilityGeometry } from "./hash-icon/utility-geometry";

import type { HashIconBadgeVisibility } from "./hash-icon/add-node-geometry";
import type {
  HashIconAnimationMode,
  HashIconMotion,
  HashIconTransition,
  IconMotionProps,
} from "./hash-icon/motion";
import type { HashIconStatus } from "./hash-icon/state-geometry";
import type { ComponentType, PropsWithChildren, SVGProps } from "react";

export { hashIconHints } from "./hash-icon/shared/hints";

export { hashIconEffects } from "./hash-icon/motion";
export type { HashIconStatus } from "./hash-icon/state-geometry";
export type { HashIconBadgeVisibility } from "./hash-icon/add-node-geometry";
export type {
  HashIconAnimationMode,
  HashIconEffect,
  HashIconMotion,
  HashIconTransition,
  HashIconChoreography,
} from "./hash-icon/motion";

export type HashIconVariant = "outline" | "filled";

export type HashIconDefaults = {
  size?: number;
  /** Stroke weight from 100 to 700, with 400 as the default. */
  weight?: number;
  color?: string;
  motion?: HashIconMotion;
  animationMode?: HashIconAnimationMode;
  duration?: number;
};

const HashIconContext = createContext<HashIconDefaults & { enabled?: boolean }>(
  {},
);

export const useHashIconPackEnabled = () =>
  use(HashIconContext).enabled ?? false;

export const useHashIconMotionAllowed = () =>
  useIconMotionAllowed(use(HashIconContext).motion ?? "auto");

const searchGeometry = (
  <g fill="none">
    <circle cx="10.5" cy="10.5" r="6.75" />
    <path d="m15.25 15.25 5.25 5.25" />
  </g>
);

const geometry = {
  ...additionalGeometry,
  ...utilityGeometry,
  ...explorationGeometry,
  ...logicGeometry,
  ...libraryGeometry,
  ...keycapGeometry,
  mcpServer: <McpServerGeometry />,
  sidebar: null,
  menu: null,
  microphone: null,
  playback: null,
  diagnostics: null,
  loading: (
    <g fill="none">
      <circle cx="12" cy="12" r="8" opacity="0.2" />
      <path d="M12 4a8 8 0 0 1 8 8" />
    </g>
  ),
  hand: (
    <FilledShape cutout={<path d="M11 5.5V11m3-5.5V11m3-3.5V12" />}>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V4a1.5 1.5 0 0 1 3 0v1.5a1.5 1.5 0 0 1 3 0v2a1.5 1.5 0 0 1 3 0V14c0 4.5-2.5 7-6.5 7h-.75c-2 0-3.75-.8-5.25-2.25L3.75 14a1.5 1.5 0 0 1 2.1-2.1L8 14.1Z" />
    </FilledShape>
  ),
  cursor: <path d="M6 3.5v17l4-4 3 5 2.5-1.5-3-5H18Z" strokeMiterlimit={3} />,
  place: <circle cx="12" cy="12" r="8" />,
  transition: <rect x="4" y="4" width="16" height="16" rx="1" />,
  addPlace: null,
  addTransition: null,
  settings: null,
  parameter: null,
  function: (
    <path
      d="M6.5 20h1.1c2.1 0 2.5-1.9 3-4.8l1.1-6.4C12.2 5.9 12.8 4 15.2 4h2.3M7 10.5h10"
      fill="none"
    />
  ),
  play: <path d="M7 4.75 19.5 12 7 19.25Z" />,
  pause: <PauseGeometry />,
  stepForward: (
    <>
      <path d="m5 5.5 10 6.5-10 6.5Z" />
      <path d="M19 5v14" fill="none" />
    </>
  ),
  stop: <rect x="4" y="4" width="16" height="16" rx="1" />,
  plus: <path d="M5 12h14M12 5v14" fill="none" />,
  minus: <path d="M5 12h14" fill="none" />,
  close: <path d="m6 6 12 12M6 18 18 6" fill="none" />,
  check: <path d="m5 12 4.5 4.5L19 7" fill="none" />,
  search: searchGeometry,
  zoomIn: (
    <>
      {searchGeometry}
      <path d="M7.5 10.5h6m-3-3v6" fill="none" />
    </>
  ),
  zoomOut: (
    <>
      {searchGeometry}
      <path d="M7.5 10.5h6" fill="none" />
    </>
  ),
  fitView: <path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" fill="none" />,
  chevronUp: <path d="m7 14.5 5-5 5 5" fill="none" />,
  chevronDown: <path d="m7 9.5 5 5 5-5" fill="none" />,
  chevronLeft: <path d="m14.5 7-5 5 5 5" fill="none" />,
  chevronRight: <path d="m9.5 7 5 5-5 5" fill="none" />,
  ...modelingGeometry,
} as const;

export type HashIconName = keyof typeof geometry;

const stateTransitionIcons: readonly HashIconName[] = [
  "addPlace",
  "addTransition",
  "sidebar",
  "settings",
  "flask",
  "layer",
  "shapes",
  "diagnostics",
];

export const getHashIconEffects = (name: HashIconName) =>
  hashIconEffects.filter((effect) => {
    if (effect === "action") return !stateTransitionIcons.includes(name);
    if (effect === "draw")
      return (
        name === "addPlace" ||
        name === "addTransition" ||
        name === "parameter" ||
        name in modelingGeometry
      );
    return true;
  });

export const hashIconNames = Object.keys(geometry) as HashIconName[];

export type HashIconProps = HashIconDefaults &
  IconMotionProps &
  Omit<SVGProps<SVGSVGElement>, "children" | "name"> & {
    name: HashIconName;
    variant?: HashIconVariant;
    selected?: boolean;
    collapsed?: boolean;
    open?: boolean;
    playing?: boolean;
    muted?: boolean;
    status?: HashIconStatus;
    hover?: "auto" | "none";
    interaction?: "auto" | "none";
    badge?: HashIconBadgeVisibility;
    transition?: HashIconTransition;
  };

export const HashIcon = ({
  name,
  size,
  weight,
  color,
  variant = "outline",
  strokeWidth,
  effect,
  hoverEffect,
  animationMode,
  trigger,
  active,
  duration,
  choreography,
  drawProgress,
  motion,
  selected = false,
  collapsed = false,
  open = false,
  playing = false,
  muted = false,
  status = "valid",
  hover = "auto",
  interaction = "auto",
  badge = "hover",
  transition = "smooth",
  ...props
}: HashIconProps) => {
  const defaults = use(HashIconContext);
  const motionAllowed = useIconMotionAllowed(
    motion ?? defaults.motion ?? "auto",
  );
  const resolvedDuration = resolveIconDuration(
    duration ?? defaults.duration ?? 600,
  );
  const resolvedAnimationMode =
    animationMode ?? defaults.animationMode ?? (active ? "continuous" : "once");
  const drawing =
    drawProgress !== undefined ||
    (typeof effect === "string" ? effect === "draw" : effect?.includes("draw"));
  const hoverAllowed = motionAllowed && hover === "auto" && !drawing;
  const defaultHoverAllowed = hoverAllowed && !hoverEffect;
  const motionRef = useIconEffects({
    effect,
    hoverEffect: hoverAllowed ? hoverEffect : undefined,
    animationMode: resolvedAnimationMode,
    trigger,
    active,
    duration: resolvedDuration,
    choreography,
    allowed: motionAllowed,
    identity: `${name}:${variant}`,
    name,
    interactive: interaction === "auto" && !drawing,
    authoredHover: defaultHoverAllowed && name in modelingGeometry,
    drawProgress,
  });
  const isAddIcon = name === "addPlace" || name === "addTransition";
  const resolvedTransition = getIconTransition(
    motionAllowed,
    transition,
    resolvedDuration,
  );
  const simulationTransition = getIconTransition(
    motionAllowed,
    transition,
    Math.min(resolvedDuration, 300),
  );
  const resolvedSize = size ?? defaults.size ?? 24;
  const requestedWeight = weight ?? defaults.weight ?? 400;
  const resolvedWeight = Number.isFinite(requestedWeight)
    ? Math.min(700, Math.max(100, requestedWeight))
    : 400;
  const resolvedStrokeWidth = strokeWidth ?? 0.75 + resolvedWeight / 400;
  const labelled = Boolean(props["aria-label"] || props["aria-labelledby"]);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={resolvedSize}
      height={resolvedSize}
      viewBox="0 0 24 24"
      fill={variant === "filled" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={resolvedStrokeWidth}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      strokeMiterlimit={2}
      color={color ?? defaults.color ?? "currentColor"}
      role={labelled ? "img" : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      {...props}
      style={
        {
          "--hash-icon-stroke-width": resolvedStrokeWidth,
          "--hash-icon-dot-size": "calc(var(--hash-icon-stroke-width) * 1.25)",
          "--hash-icon-detail-stroke":
            "calc(var(--hash-icon-stroke-width) * 1.4)",
          "--petricon-iterations":
            resolvedAnimationMode === "continuous" ? "infinite" : "1",
          ...(name === "diagnostics" ? { transition: resolvedTransition } : {}),
          ...(name === "personRunning" ? { overflow: "visible" } : {}),
          ...props.style,
        } as React.CSSProperties
      }
      data-icon-pack="petrinaut-experimental"
      data-petricon=""
      data-icon={name}
      data-icon-animation-mode={resolvedAnimationMode}
      data-icon-status={name === "diagnostics" ? status : undefined}
    >
      <IconFillContext value={variant === "filled"}>
        <g ref={motionRef} data-icon-motion={motionAllowed ? "auto" : "none"}>
          {isAddIcon ? (
            <AddNodeGeometry
              kind={name === "addPlace" ? "place" : "transition"}
              filled={variant === "filled"}
              selected={selected}
              badge={badge}
              transition={resolvedTransition}
            />
          ) : name === "sidebar" ? (
            <SidebarGeometry
              collapsed={collapsed}
              filled={variant === "filled"}
              motionAllowed={defaultHoverAllowed}
              transition={resolvedTransition}
            />
          ) : name === "settings" ? (
            <SettingsGeometry open={open} transition={resolvedTransition} />
          ) : name === "flask" ? (
            <FlaskGeometry
              selected={selected}
              hover={defaultHoverAllowed}
              filled={variant === "filled"}
              transition={simulationTransition}
              waveDuration={Math.min(resolvedDuration, 480)}
            />
          ) : name === "layer" ? (
            <LayerGeometry
              selected={selected}
              hover={defaultHoverAllowed}
              filled={variant === "filled"}
              transition={simulationTransition}
            />
          ) : name === "shapes" ? (
            <ShapesGeometry
              selected={selected}
              hover={defaultHoverAllowed}
              strokeWidth={resolvedStrokeWidth}
              transition={getIconTransition(
                motionAllowed,
                transition,
                Math.min(resolvedDuration, 320),
              )}
            />
          ) : (
            <IconMotionLayer name="whole">
              <IconInteraction
                name={name}
                enabled={defaultHoverAllowed && !(name in modelingGeometry)}
                duration={Math.min(resolvedDuration, 480)}
                transition={getIconTransition(
                  motionAllowed,
                  transition,
                  Math.min(resolvedDuration, 160),
                )}
              >
                {name === "diagnostics" ? (
                  <DiagnosticsGeometry
                    status={status}
                    transition={resolvedTransition}
                  />
                ) : name === "menu" ? (
                  <MenuGeometry open={open} transition={resolvedTransition} />
                ) : name === "microphone" ? (
                  <MicrophoneGeometry
                    muted={muted}
                    transition={resolvedTransition}
                  />
                ) : name === "playback" ? (
                  <PlaybackGeometry
                    playing={playing}
                    transition={resolvedTransition}
                  />
                ) : name === "parameter" ? (
                  <ParameterGeometry
                    duration={Math.min(resolvedDuration, 480)}
                    animated={resolvedTransition !== "none"}
                  />
                ) : (
                  <g
                    fill={
                      name in additionalGeometry ||
                      name in explorationGeometry ||
                      name in modelingGeometry ||
                      name in logicGeometry ||
                      (name in utilityGeometry && name !== "star")
                        ? "none"
                        : undefined
                    }
                  >
                    {geometry[name]}
                  </g>
                )}
              </IconInteraction>
            </IconMotionLayer>
          )}
        </g>
      </IconFillContext>
    </svg>
  );
};

export type HashIconComponentProps = Omit<HashIconProps, "name">;

const createIcon = (
  name: HashIconName,
  variant: HashIconVariant = "outline",
) => {
  const IconComponent = (props: HashIconComponentProps) => (
    <HashIcon variant={variant} {...props} name={name} />
  );
  return IconComponent;
};

export const MonitoringInstrumentIcon = createIcon("monitoringInstrument");
export const SensorIcon = createIcon("sensor");
export const MethaneIcon = createIcon("methane");
export const CarbonDioxideIcon = createIcon("carbonDioxide");
export const OxygenIcon = createIcon("oxygen");
export const CarbonMonoxideIcon = createIcon("carbonMonoxide");
export const HydrogenSulfideIcon = createIcon("hydrogenSulfide");
export const SulfurDioxideIcon = createIcon("sulfurDioxide");
export const OrganicCompoundIcon = createIcon("organicCompound");
export const RadiationIcon = createIcon("radiation");
export const WaterLevelIcon = createIcon("waterLevel");
export const WaterSplashIcon = createIcon("waterSplash");
export const ParticulateMatter1Icon = createIcon("particulateMatter1");
export const ParticulateMatter2Point5Icon = createIcon(
  "particulateMatter2Point5",
);
export const ParticulateMatter10Icon = createIcon("particulateMatter10");
export const ParticulateMatterTotalIcon = createIcon("particulateMatterTotal");
export const PressureDifferentialIcon = createIcon("pressureDifferential");
export const FluidFlowIcon = createIcon("fluidFlow");
export const DewPointIcon = createIcon("dewPoint");
export const CloudRainIcon = createIcon("cloudRain");
export const BatteryIcon = createIcon("battery");
export const BatteryLowIcon = createIcon("batteryLow");
export const BatteryLevelIcon = createIcon("batteryLevel");
export const BatteryBoltIcon = createIcon("batteryBolt");
export const SignalStrengthIcon = createIcon("signalStrength");
export const BookmarkIcon = createIcon("bookmark");
export const CloudLightningIcon = createIcon("cloudLightning");
export const CloudSunIcon = createIcon("cloudSun");
export const ContactCardIcon = createIcon("contactCard");
export const FolderOpenIcon = createIcon("folderOpen");
export const GhostIcon = createIcon("ghost");
export const HardDriveIcon = createIcon("hardDrive");
export const HeartPulseIcon = createIcon("heartPulse");
export const ImagePlusIcon = createIcon("imagePlus");
export const LocationPlusIcon = createIcon("locationPlus");
export const RouterIcon = createIcon("router");
export const CloudUploadIcon = createIcon("cloudUpload");
export const MoveIcon = createIcon("move");

export const FileArchiveIcon = createIcon("fileArchive");
export const FileCodeIcon = createIcon("fileCode");
export const FileDocumentIcon = createIcon("fileDocument");
export const FileTextIcon = createIcon("fileText");
export const FileInvoiceIcon = createIcon("fileInvoice");
export const FileContractIcon = createIcon("fileContract");
export const FilePresentationIcon = createIcon("filePresentation");
export const FilePdfIcon = createIcon("filePdf");
export const FileAudioIcon = createIcon("fileAudio");
export const FileVideoIcon = createIcon("fileVideo");
export const FileImageIcon = createIcon("fileImage");
export const FileBoxIcon = createIcon("fileBox");
export const FileInvoiceDollarIcon = createIcon("fileInvoiceDollar");
export const FilePlusIcon = createIcon("filePlus");
export const FileEditIcon = createIcon("fileEdit");
export const FileExportIcon = createIcon("fileExport");
export const FilesIcon = createIcon("files");
export const FolderIcon = createIcon("folder");
export const NoteStickyIcon = createIcon("noteSticky");
export const NotePlusIcon = createIcon("notePlus");
export const MemoInfoIcon = createIcon("memoInfo");
export const ClipboardIcon = createIcon("clipboard");
export const ClipboardCheckIcon = createIcon("clipboardCheck");
export const ClipboardListIcon = createIcon("clipboardList");
export const ArchiveIcon = createIcon("archive");
export const BookIcon = createIcon("book");
export const BookOpenIcon = createIcon("bookOpen");
export const BooksIcon = createIcon("books");
export const NewspaperIcon = createIcon("newspaper");
export const HandwrittenDocsIcon = createIcon("handwrittenDocs");
export const CalendarDayIcon = createIcon("calendarDay");
export const CalendarWeekIcon = createIcon("calendarWeek");
export const CalendarDaysIcon = createIcon("calendarDays");
export const CalendarCheckIcon = createIcon("calendarCheck");
export const CalendarsIcon = createIcon("calendars");
export const HistoryPagesIcon = createIcon("historyPages");
export const HistoryUserIcon = createIcon("historyUser");
export const UploadIcon = createIcon("upload");
export const LoginIcon = createIcon("login");
export const LogoutIcon = createIcon("logout");
export const ArrowTurnDownLeftIcon = createIcon("arrowTurnDownLeft");
export const ArrowTurnDownRightIcon = createIcon("arrowTurnDownRight");
export const ArrowProgressIcon = createIcon("arrowProgress");
export const ChevronsUpDownIcon = createIcon("chevronsUpDown");
export const ExpandHorizontalIcon = createIcon("expandHorizontal");
export const ExpandVerticalIcon = createIcon("expandVertical");
export const ExpandDiagonalIcon = createIcon("expandDiagonal");
export const CollapseVerticalIcon = createIcon("collapseVertical");
export const RedoIcon = createIcon("redo");
export const ShuffleIcon = createIcon("shuffle");
export const ArrowPointerIcon = createIcon("arrowPointer");
export const CircleArrowRightIcon = createIcon("circleArrowRight");
export const CircleArrowUpRightIcon = createIcon("circleArrowUpRight");
export const CircleUpIcon = createIcon("circleUp");
export const CirclePlayIcon = createIcon("circlePlay");
export const SquareCloseIcon = createIcon("squareClose");
export const SquareMinusIcon = createIcon("squareMinus");
export const RadioCheckedIcon = createIcon("radioChecked");
export const CheckDoubleIcon = createIcon("checkDouble");
export const EqualsIcon = createIcon("equals");
export const HelpIcon = createIcon("help");
export const DotIcon = createIcon("dot");
export const PinIcon = createIcon("pin");
export const TagIcon = createIcon("tag");
export const PowerIcon = createIcon("power");
export const ToggleOnIcon = createIcon("toggleOn");
export const ToggleOffIcon = createIcon("toggleOff");
export const CommandIcon = createIcon("command");
export const KeycapAIcon = createIcon("keycapA");
export const KeycapBIcon = createIcon("keycapB");
export const KeycapCIcon = createIcon("keycapC");
export const KeycapDIcon = createIcon("keycapD");
export const KeycapEIcon = createIcon("keycapE");
export const KeycapFIcon = createIcon("keycapF");
export const KeycapGIcon = createIcon("keycapG");
export const KeycapHIcon = createIcon("keycapH");
export const KeycapIIcon = createIcon("keycapI");
export const KeycapJIcon = createIcon("keycapJ");
export const KeycapKIcon = createIcon("keycapK");
export const KeycapLIcon = createIcon("keycapL");
export const KeycapMIcon = createIcon("keycapM");
export const KeycapNIcon = createIcon("keycapN");
export const KeycapOIcon = createIcon("keycapO");
export const KeycapPIcon = createIcon("keycapP");
export const KeycapQIcon = createIcon("keycapQ");
export const KeycapRIcon = createIcon("keycapR");
export const KeycapSIcon = createIcon("keycapS");
export const KeycapTIcon = createIcon("keycapT");
export const KeycapUIcon = createIcon("keycapU");
export const KeycapVIcon = createIcon("keycapV");
export const KeycapWIcon = createIcon("keycapW");
export const KeycapXIcon = createIcon("keycapX");
export const KeycapYIcon = createIcon("keycapY");
export const KeycapZIcon = createIcon("keycapZ");
export const Keycap0Icon = createIcon("keycap0");
export const Keycap1Icon = createIcon("keycap1");
export const Keycap2Icon = createIcon("keycap2");
export const Keycap3Icon = createIcon("keycap3");
export const Keycap4Icon = createIcon("keycap4");
export const Keycap5Icon = createIcon("keycap5");
export const Keycap6Icon = createIcon("keycap6");
export const Keycap7Icon = createIcon("keycap7");
export const Keycap8Icon = createIcon("keycap8");
export const Keycap9Icon = createIcon("keycap9");
export const KeycapBacktickIcon = createIcon("keycapBacktick");
export const KeycapTildeIcon = createIcon("keycapTilde");
export const KeycapExclamationIcon = createIcon("keycapExclamation");
export const KeycapAtIcon = createIcon("keycapAt");
export const KeycapHashIcon = createIcon("keycapHash");
export const KeycapDollarIcon = createIcon("keycapDollar");
export const KeycapPercentIcon = createIcon("keycapPercent");
export const KeycapCaretIcon = createIcon("keycapCaret");
export const KeycapAmpersandIcon = createIcon("keycapAmpersand");
export const KeycapAsteriskIcon = createIcon("keycapAsterisk");
export const KeycapParenLeftIcon = createIcon("keycapParenLeft");
export const KeycapParenRightIcon = createIcon("keycapParenRight");
export const KeycapMinusIcon = createIcon("keycapMinus");
export const KeycapUnderscoreIcon = createIcon("keycapUnderscore");
export const KeycapPlusIcon = createIcon("keycapPlus");
export const KeycapEqualsIcon = createIcon("keycapEquals");
export const KeycapBracketLeftIcon = createIcon("keycapBracketLeft");
export const KeycapBracketRightIcon = createIcon("keycapBracketRight");
export const KeycapBraceLeftIcon = createIcon("keycapBraceLeft");
export const KeycapBraceRightIcon = createIcon("keycapBraceRight");
export const KeycapBackslashIcon = createIcon("keycapBackslash");
export const KeycapPipeIcon = createIcon("keycapPipe");
export const KeycapSemicolonIcon = createIcon("keycapSemicolon");
export const KeycapColonIcon = createIcon("keycapColon");
export const KeycapQuoteIcon = createIcon("keycapQuote");
export const KeycapDoubleQuoteIcon = createIcon("keycapDoubleQuote");
export const KeycapCommaIcon = createIcon("keycapComma");
export const KeycapPeriodIcon = createIcon("keycapPeriod");
export const KeycapSlashIcon = createIcon("keycapSlash");
export const KeycapQuestionIcon = createIcon("keycapQuestion");
export const KeycapLessThanIcon = createIcon("keycapLessThan");
export const KeycapGreaterThanIcon = createIcon("keycapGreaterThan");
export const KeycapF1Icon = createIcon("keycapF1");
export const KeycapF2Icon = createIcon("keycapF2");
export const KeycapF3Icon = createIcon("keycapF3");
export const KeycapF4Icon = createIcon("keycapF4");
export const KeycapF5Icon = createIcon("keycapF5");
export const KeycapF6Icon = createIcon("keycapF6");
export const KeycapF7Icon = createIcon("keycapF7");
export const KeycapF8Icon = createIcon("keycapF8");
export const KeycapF9Icon = createIcon("keycapF9");
export const KeycapF10Icon = createIcon("keycapF10");
export const KeycapF11Icon = createIcon("keycapF11");
export const KeycapF12Icon = createIcon("keycapF12");
export const KeycapEscapeIcon = createIcon("keycapEscape");
export const KeycapAltIcon = createIcon("keycapAlt");
export const KeycapFnIcon = createIcon("keycapFn");
export const KeycapInsertIcon = createIcon("keycapInsert");
export const KeycapPrintScreenIcon = createIcon("keycapPrintScreen");
export const KeycapCommandIcon = createIcon("keycapCommand");
export const KeycapShiftIcon = createIcon("keycapShift");
export const KeycapControlIcon = createIcon("keycapControl");
export const KeycapOptionIcon = createIcon("keycapOption");
export const KeycapWindowsIcon = createIcon("keycapWindows");
export const KeycapTabIcon = createIcon("keycapTab");
export const KeycapEnterIcon = createIcon("keycapEnter");
export const KeycapBackspaceIcon = createIcon("keycapBackspace");
export const KeycapDeleteIcon = createIcon("keycapDelete");
export const KeycapSpaceIcon = createIcon("keycapSpace");
export const KeycapCapsLockIcon = createIcon("keycapCapsLock");
export const KeycapArrowUpIcon = createIcon("keycapArrowUp");
export const KeycapArrowDownIcon = createIcon("keycapArrowDown");
export const KeycapArrowLeftIcon = createIcon("keycapArrowLeft");
export const KeycapArrowRightIcon = createIcon("keycapArrowRight");
export const KeycapHomeIcon = createIcon("keycapHome");
export const KeycapEndIcon = createIcon("keycapEnd");
export const KeycapPageUpIcon = createIcon("keycapPageUp");
export const KeycapPageDownIcon = createIcon("keycapPageDown");
export const KeycapPauseIcon = createIcon("keycapPause");
export const KeycapNumLockIcon = createIcon("keycapNumLock");
export const KeycapScrollLockIcon = createIcon("keycapScrollLock");
export const KeycapMenuIcon = createIcon("keycapMenu");
export const KeycapEjectIcon = createIcon("keycapEject");
export const KeyboardIcon = createIcon("keyboard");
export const PaperclipIcon = createIcon("paperclip");
export const KeyIcon = createIcon("key");
export const RectangleIcon = createIcon("rectangle");
export const EllipseIcon = createIcon("ellipse");
export const DiamondIcon = createIcon("diamond");
export const TriangleIcon = createIcon("triangle");
export const PentagonIcon = createIcon("pentagon");
export const HexagonIcon = createIcon("hexagon");
export const OctagonIcon = createIcon("octagon");
export const ParallelogramIcon = createIcon("parallelogram");
export const TrapezoidIcon = createIcon("trapezoid");
export const BlobIcon = createIcon("blob");
export const ShapeArrowRightIcon = createIcon("shapeArrowRight");
export const ShapeArrowDownIcon = createIcon("shapeArrowDown");
export const ShapeArrowLeftIcon = createIcon("shapeArrowLeft");
export const ShapeArrowUpIcon = createIcon("shapeArrowUp");
export const ArrowheadArrowIcon = createIcon("arrowheadArrow");
export const ArrowheadBarIcon = createIcon("arrowheadBar");
export const ArrowheadDiamondIcon = createIcon("arrowheadDiamond");
export const ArrowheadDotIcon = createIcon("arrowheadDot");
export const ArrowheadSquareIcon = createIcon("arrowheadSquare");
export const ArrowheadTriangleIcon = createIcon("arrowheadTriangle");
export const ArrowheadTriangleInvertedIcon = createIcon(
  "arrowheadTriangleInverted",
);
export const ArrowheadNoneIcon = createIcon("arrowheadNone");
export const DashSolidIcon = createIcon("dashSolid");
export const DashDashedIcon = createIcon("dashDashed");
export const DashDottedIcon = createIcon("dashDotted");
export const DashDrawIcon = createIcon("dashDraw");
export const SplineLineIcon = createIcon("splineLine");
export const SplineCubicIcon = createIcon("splineCubic");
export const RoundedCornerIcon = createIcon("roundedCorner");
export const FrameIcon = createIcon("frame");
export const AspectRatioIcon = createIcon("aspectRatio");
export const CanvasIcon = createIcon("canvas");
export const EraserIcon = createIcon("eraser");
export const HighlighterIcon = createIcon("highlighter");
export const PencilSlashIcon = createIcon("pencilSlash");
export const PencilRulerIcon = createIcon("pencilRuler");
export const FillNoneIcon = createIcon("fillNone");
export const FillSolidIcon = createIcon("fillSolid");
export const FillSemiIcon = createIcon("fillSemi");
export const FillPatternIcon = createIcon("fillPattern");
export const SizeSmallIcon = createIcon("sizeSmall");
export const SizeMediumIcon = createIcon("sizeMedium");
export const SizeLargeIcon = createIcon("sizeLarge");
export const SizeExtraLargeIcon = createIcon("sizeExtraLarge");
export const AlignLeftIcon = createIcon("alignLeft");
export const AlignRightIcon = createIcon("alignRight");
export const AlignTopIcon = createIcon("alignTop");
export const AlignBottomIcon = createIcon("alignBottom");
export const AlignCenterHorizontalIcon = createIcon("alignCenterHorizontal");
export const AlignCenterVerticalIcon = createIcon("alignCenterVertical");
export const AlignTopLeftIcon = createIcon("alignTopLeft");
export const AlignTopCenterIcon = createIcon("alignTopCenter");
export const AlignTopRightIcon = createIcon("alignTopRight");
export const AlignCenterLeftIcon = createIcon("alignCenterLeft");
export const AlignCenterCenterIcon = createIcon("alignCenterCenter");
export const AlignCenterRightIcon = createIcon("alignCenterRight");
export const AlignBottomLeftIcon = createIcon("alignBottomLeft");
export const AlignBottomCenterIcon = createIcon("alignBottomCenter");
export const AlignBottomRightIcon = createIcon("alignBottomRight");
export const DistributeHorizontalIcon = createIcon("distributeHorizontal");
export const DistributeVerticalIcon = createIcon("distributeVertical");
export const StackHorizontalIcon = createIcon("stackHorizontal");
export const StackVerticalIcon = createIcon("stackVertical");
export const GroupIcon = createIcon("group");
export const UngroupIcon = createIcon("ungroup");
export const BringForwardIcon = createIcon("bringForward");
export const SendBackwardIcon = createIcon("sendBackward");
export const BringToFrontIcon = createIcon("bringToFront");
export const SendToBackIcon = createIcon("sendToBack");
export const RectanglesMixedIcon = createIcon("rectanglesMixed");
export const ColumnsIcon = createIcon("columns");
export const RowsIcon = createIcon("rows");
export const SplitViewIcon = createIcon("splitView");
export const MixedIcon = createIcon("mixed");
export const BoldIcon = createIcon("bold");
export const ItalicIcon = createIcon("italic");
export const UnderlineIcon = createIcon("underline");
export const StrikethroughIcon = createIcon("strikethrough");
export const FontSansIcon = createIcon("fontSans");
export const FontSerifIcon = createIcon("fontSerif");
export const FontMonoIcon = createIcon("fontMono");
export const FontDrawIcon = createIcon("fontDraw");
export const FontCaseIcon = createIcon("fontCase");
export const HashtagIcon = createIcon("hashtag");
export const PercentIcon = createIcon("percent");
export const TextAlignLeftIcon = createIcon("textAlignLeft");
export const TextAlignRightIcon = createIcon("textAlignRight");
export const TextAlignCenterIcon = createIcon("textAlignCenter");
export const TextAlignJustifyIcon = createIcon("textAlignJustify");
export const QuoteIcon = createIcon("quote");
export const ListOrderedIcon = createIcon("listOrdered");
export const ListCheckIcon = createIcon("listCheck");
export const ListTimelineIcon = createIcon("listTimeline");
export const ShieldCheckIcon = createIcon("shieldCheck");
export const ShieldAlertIcon = createIcon("shieldAlert");
export const BadgeCheckIcon = createIcon("badgeCheck");
export const BallotCheckIcon = createIcon("ballotCheck");
export const MailIcon = createIcon("mail");
export const MailUnreadIcon = createIcon("mailUnread");
export const MessageIcon = createIcon("message");
export const MessageDollarIcon = createIcon("messageDollar");
export const MessageQuestionIcon = createIcon("messageQuestion");
export const InboxIcon = createIcon("inbox");
export const SendIcon = createIcon("send");
export const ShareIcon = createIcon("share");
export const ShareNodesIcon = createIcon("shareNodes");
export const MegaphoneIcon = createIcon("megaphone");
export const PhoneIcon = createIcon("phone");
export const PhoneOffIcon = createIcon("phoneOff");
export const SpeakerIcon = createIcon("speaker");
export const SearchCheckIcon = createIcon("searchCheck");
export const SearchEmptyIcon = createIcon("searchEmpty");
export const SearchDollarIcon = createIcon("searchDollar");
export const SearchChartIcon = createIcon("searchChart");
export const UsersIcon = createIcon("users");
export const UserTieIcon = createIcon("userTie");
export const UserLockIcon = createIcon("userLock");
export const UserSearchIcon = createIcon("userSearch");
export const UserTagIcon = createIcon("userTag");
export const UserBountyHunterIcon = createIcon("userBountyHunter");
export const PersonIcon = createIcon("person");
export const AccessibilityIcon = createIcon("accessibility");
export const PersonGreetingIcon = createIcon("personGreeting");
export const PersonSignIcon = createIcon("personSign");
export const PersonPortalIcon = createIcon("personPortal");
export const PersonBoothIcon = createIcon("personBooth");
export const FamilyIcon = createIcon("family");
export const PeopleArrowsIcon = createIcon("peopleArrows");
export const ExpertInterviewsIcon = createIcon("expertInterviews");
export const HospitalUserIcon = createIcon("hospitalUser");
export const ThumbsUpIcon = createIcon("thumbsUp");
export const ThumbsDownIcon = createIcon("thumbsDown");
export const HandshakeIcon = createIcon("handshake");
export const SmileIcon = createIcon("smile");
export const SadIcon = createIcon("sad");
export const HeartIcon = createIcon("heart");
export const BrainIcon = createIcon("brain");
export const MonitorIcon = createIcon("monitor");
export const LaptopIcon = createIcon("laptop");
export const BrowserIcon = createIcon("browser");
export const AppIcon = createIcon("app");
export const ServerIcon = createIcon("server");
export const DatabaseIcon = createIcon("database");
export const MicrochipIcon = createIcon("microchip");
export const CreditCardIcon = createIcon("creditCard");
export const CalculatorIcon = createIcon("calculator");
export const DevicesIcon = createIcon("devices");
export const MagneticMediaIcon = createIcon("magneticMedia");
export const ScanLineIcon = createIcon("scanLine");
export const ScannerIcon = createIcon("scanner");
export const BinaryIcon = createIcon("binary");
export const CloudDownloadIcon = createIcon("cloudDownload");
export const CodeEditIcon = createIcon("codeEdit");
export const CodeBranchIcon = createIcon("codeBranch");
export const PullRequestIcon = createIcon("pullRequest");
export const BuildingIcon = createIcon("building");
export const BuildingSearchIcon = createIcon("buildingSearch");
export const BuildingShieldIcon = createIcon("buildingShield");
export const CityIcon = createIcon("city");
export const HomeIcon = createIcon("home");
export const BankIcon = createIcon("bank");
export const FactoryIcon = createIcon("factory");
export const WarehouseIcon = createIcon("warehouse");
export const ShopIcon = createIcon("shop");
export const LocationIcon = createIcon("location");
export const LocationCheckIcon = createIcon("locationCheck");
export const MapIcon = createIcon("map");
export const MapPinIcon = createIcon("mapPin");
export const CompassIcon = createIcon("compass");
export const CrosshairsIcon = createIcon("crosshairs");
export const GlobeIcon = createIcon("globe");
export const GlobeNodesIcon = createIcon("globeNodes");
export const GlobePointerIcon = createIcon("globePointer");
export const GlobeStandIcon = createIcon("globeStand");
export const RouteIcon = createIcon("route");
export const BriefcaseIcon = createIcon("briefcase");
export const GraduationCapIcon = createIcon("graduationCap");
export const BoxIcon = createIcon("box");
export const BoxesIcon = createIcon("boxes");
export const PackIcon = createIcon("pack");
export const BoxesPackingIcon = createIcon("boxesPacking");
export const BoxLocationIcon = createIcon("boxLocation");
export const ShelvesIcon = createIcon("shelves");
export const ConveyorBeltIcon = createIcon("conveyorBelt");
export const ForkliftIcon = createIcon("forklift");
export const PersonDollyIcon = createIcon("personDolly");
export const TruckContainerIcon = createIcon("truckContainer");
export const TruckFastIcon = createIcon("truckFast");
export const TruckRampIcon = createIcon("truckRamp");
export const ShoppingCartIcon = createIcon("shoppingCart");
export const ShoppingBasketIcon = createIcon("shoppingBasket");
export const GiftIcon = createIcon("gift");
export const PlaneIcon = createIcon("plane");
export const PlaneUpIcon = createIcon("planeUp");
export const JetIcon = createIcon("jet");
export const PlaneTailIcon = createIcon("planeTail");
export const PlaneDepartureIcon = createIcon("planeDeparture");
export const PlaneArrivalIcon = createIcon("planeArrival");
export const TruckPlaneIcon = createIcon("truckPlane");
export const TowerControlIcon = createIcon("towerControl");
export const DollarIcon = createIcon("dollar");
export const CoinsIcon = createIcon("coins");
export const MoneyTransferIcon = createIcon("moneyTransfer");
export const HandDollarIcon = createIcon("handDollar");
export const ReceiptIcon = createIcon("receipt");
export const ChartRevenueIcon = createIcon("chartRevenue");
export const ChartMixedIcon = createIcon("chartMixed");
export const PieChartIcon = createIcon("pieChart");
export const PresentationChartIcon = createIcon("presentationChart");
export const GaugeIcon = createIcon("gauge");
export const SunIcon = createIcon("sun");
export const MoonIcon = createIcon("moon");
export const SunMoonIcon = createIcon("sunMoon");
export const WavesIcon = createIcon("waves");
export const WavePulseIcon = createIcon("wavePulse");
export const SignalIcon = createIcon("signal");
export const VibrationIcon = createIcon("vibration");
export const HumidityIcon = createIcon("humidity");
export const ThermometerIcon = createIcon("thermometer");
export const ThermometerColdIcon = createIcon("thermometerCold");
export const ThermometerHotIcon = createIcon("thermometerHot");
export const AntennaIcon = createIcon("antenna");
export const RadarIcon = createIcon("radar");
export const OrbitIcon = createIcon("orbit");
export const SolarSystemIcon = createIcon("solarSystem");
export const AtomIcon = createIcon("atom");
export const VirusIcon = createIcon("virus");
export const BiohazardIcon = createIcon("biohazard");
export const TestTubesIcon = createIcon("testTubes");
export const FlaskVialIcon = createIcon("flaskVial");
export const MortarPestleIcon = createIcon("mortarPestle");
export const BinocularsIcon = createIcon("binoculars");
export const TelescopeIcon = createIcon("telescope");
export const RocketIcon = createIcon("rocket");
export const PaletteIcon = createIcon("palette");
export const SwatchBookIcon = createIcon("swatchBook");
export const GemIcon = createIcon("gem");
export const TrophyIcon = createIcon("trophy");
export const HammerIcon = createIcon("hammer");
export const LighthouseIcon = createIcon("lighthouse");
export const LifeRingIcon = createIcon("lifeRing");
export const PalmTreeIcon = createIcon("palmTree");
export const PizzaIcon = createIcon("pizza");
export const CookieIcon = createIcon("cookie");
export const PartyHornIcon = createIcon("partyHorn");
export const TeddyBearIcon = createIcon("teddyBear");
export const TombstoneIcon = createIcon("tombstone");
export const CctvCameraIcon = createIcon("cctvCamera");
export const ChartNetworkIcon = createIcon("chartNetwork");
export const HexagonNodesIcon = createIcon("hexagonNodes");
export const DiagramSankeyIcon = createIcon("diagramSankey");
export const SitemapIcon = createIcon("sitemap");
export const WorkflowIcon = createIcon("workflow");
export const TimelineIcon = createIcon("timeline");
export const TimelineArrowIcon = createIcon("timelineArrow");
export const TableTreeIcon = createIcon("tableTree");
export const TypeInheritanceIcon = createIcon("typeInheritance");
export const EntityIcon = createIcon("entity");
export const EntityPlusIcon = createIcon("entityPlus");
export const EntityEditIcon = createIcon("entityEdit");
export const GridPlusIcon = createIcon("gridPlus");
export const LayerPlusIcon = createIcon("layerPlus");
export const TargetArrowIcon = createIcon("targetArrow");
export const PlugCheckIcon = createIcon("plugCheck");
export const SpecificationIcon = createIcon("specification");
export const SurveyIcon = createIcon("survey");
export const CircleTwoIcon = createIcon("circleTwo");
export const CircleThreeIcon = createIcon("circleThree");
export const CircleFourIcon = createIcon("circleFour");
export const DiceD20Icon = createIcon("diceD20");
export const FlagIcon = createIcon("flag");
export const CircleAsteriskIcon = createIcon("circleAsterisk");
export const CircleTagIcon = createIcon("circleTag");
export const CloudIcon = createIcon("cloud");
export const BoxOpenIcon = createIcon("boxOpen");
export const ChartScatterIcon = createIcon("chartScatter");
export const ChartHeatmapIcon = createIcon("chartHeatmap");
export const CircleHalfIcon = createIcon("circleHalf");
export const CircleThreeQuartersIcon = createIcon("circleThreeQuarters");
export const FlameIcon = createIcon("flame");
export const WindIcon = createIcon("wind");
export const ToolsIcon = createIcon("tools");
export const ToolboxIcon = createIcon("toolbox");
export const PlaceIcon = createIcon("place");
export const SidebarIcon = createIcon("sidebar");
export const MenuIcon = createIcon("menu");
export const HandIcon = createIcon("hand");
export const CursorIcon = createIcon("cursor");
export const AddPlaceIcon = createIcon("addPlace");
export const AddTransitionIcon = createIcon("addTransition");
export const SettingsIcon = createIcon("settings");
export const TransitionIcon = createIcon("transition");
export const TokenTypeIcon = createIcon("tokenType");
export const ParameterIcon = createIcon("parameter");
export const FunctionIcon = createIcon("function");
export const PlayIcon = createIcon("play");
export const PauseIcon = createIcon("pause");
export const StepForwardIcon = createIcon("stepForward");
export const StopIcon = createIcon("stop");
export const ResetIcon = createIcon("reset");
export const PlusIcon = createIcon("plus");
export const MinusIcon = createIcon("minus");
export const CloseIcon = createIcon("close");
export const CheckIcon = createIcon("check");
export const SearchIcon = createIcon("search");
export const ZoomInIcon = createIcon("zoomIn");
export const ZoomOutIcon = createIcon("zoomOut");
export const FitViewIcon = createIcon("fitView");
export const ChevronUpIcon = createIcon("chevronUp");
export const ChevronDownIcon = createIcon("chevronDown");
export const ChevronLeftIcon = createIcon("chevronLeft");
export const ChevronRightIcon = createIcon("chevronRight");

export const InfinityIcon = createIcon("infinity");
export const ArrowUpIcon = createIcon("arrowUp");
export const ArrowDownIcon = createIcon("arrowDown");
export const ArrowLeftIcon = createIcon("arrowLeft");
export const ArrowRightIcon = createIcon("arrowRight");
export const ArrowUpRightIcon = createIcon("arrowUpRight");
export const ArrowsLeftRightIcon = createIcon("arrowsLeftRight");
export const TrashIcon = createIcon("trash");
export const PencilIcon = createIcon("pencil");
export const CopyIcon = createIcon("copy");
export const DownloadIcon = createIcon("download");
export const ExternalLinkIcon = createIcon("externalLink");
export const LinkIcon = createIcon("link");
export const LinkBrokenIcon = createIcon("linkBroken");
export const EllipsisIcon = createIcon("ellipsis");
export const EllipsisVerticalIcon = createIcon("ellipsisVertical");
export const CircleEllipsisIcon = createIcon("circleEllipsis");
export const CollapseIcon = createIcon("collapse");
export const LockOpenIcon = createIcon("lockOpen");
export const LockClosedIcon = createIcon("lockClosed");
export const EyeIcon = createIcon("eye");
export const EyeSlashIcon = createIcon("eyeSlash");
export const ClockIcon = createIcon("clock");
export const ClockRotateLeftIcon = createIcon("clockRotateLeft");
export const RotateIcon = createIcon("rotate");
export const RightToLineIcon = createIcon("rightToLine");
export const FlaskIcon = createIcon("flask");
export const LayerIcon = createIcon("layer");
export const ChartBarSimpleIcon = createIcon("chartBarSimple");
export const ChartLineIcon = createIcon("chartLine");
export const FilterIcon = createIcon("filter");
export const BracketsCurlyIcon = createIcon("bracketsCurly");
export const LambdaIcon = createIcon("lambda");
export const LightningIcon = createIcon("lightning");
export const CodeIcon = createIcon("code");
export const CubeIcon = createIcon("cube");
export const DiagramNestedIcon = createIcon("diagramNested");
export const DiagramProjectIcon = createIcon("diagramProject");
export const ShapesIcon = createIcon("shapes");
export const FileIcon = createIcon("file");
export const FileLinesIcon = createIcon("fileLines");
export const ListIcon = createIcon("list");
export const TableIcon = createIcon("table");
export const GridIcon = createIcon("grid");
export const BullseyeIcon = createIcon("bullseye");
export const ScribbleIcon = createIcon("scribble");
export const SparklesIcon = createIcon("sparkles");
export const InfoIcon = createIcon("info");
export const ErrorIcon = createIcon("error");
export const WarningIcon = createIcon("warning");
export const CircleCheckIcon = createIcon("circleCheck");
export const CircleCloseIcon = createIcon("circleClose");
export const TerminalIcon = createIcon("terminal");
export const TestTubeIcon = createIcon("testTube");
export const TestTubeCheckIcon = createIcon("testTubeCheck");
export const TestTubeCrossIcon = createIcon("testTubeCross");
export const TextIcon = createIcon("text");
export const UserIcon = createIcon("user");
export const VoiceIcon = createIcon("voice");
export const TranscriptionIcon = createIcon("transcription");
export const AssistantIcon = createIcon("assistant");
export const MicrophoneIcon = createIcon("microphone");
export const PlaybackIcon = createIcon("playback");
export const DiagnosticsIcon = createIcon("diagnostics");
export const LoadingIcon = (props: HashIconComponentProps) => (
  <HashIcon
    name="loading"
    effect="rotate"
    animationMode="continuous"
    active
    duration={1100}
    hover="none"
    {...props}
  />
);
export const ArrowTrendDownIcon = createIcon("arrowTrendDown");
export const ArrowTrendUpIcon = createIcon("arrowTrendUp");
export const AsteriskIcon = createIcon("asterisk");
export const AtIcon = createIcon("at");
export const BarcodeIcon = createIcon("barcode");
export const BellIcon = createIcon("bell");
export const BracketsSquareIcon = createIcon("bracketsSquare");
export const BugIcon = createIcon("bug");
export const CalendarIcon = createIcon("calendar");
export const CalendarClockIcon = createIcon("calendarClock");
export const CircleOneIcon = createIcon("circleOne");
export const CubesIcon = createIcon("cubes");
export const DiagramNodesIcon = createIcon("diagramNodes");
export const DiagramSubtaskIcon = createIcon("diagramSubtask");
export const DiamondExclamationIcon = createIcon("diamondExclamation");
export const EmptySetIcon = createIcon("emptySet");
export const FeatherIcon = createIcon("feather");
export const FileSpreadsheetIcon = createIcon("fileSpreadsheet");
export const GripVerticalIcon = createIcon("gripVertical");
export const ImageIcon = createIcon("image");
export const InputPipeIcon = createIcon("inputPipe");
export const LightbulbOnIcon = createIcon("lightbulbOn");
export const ListTreeIcon = createIcon("listTree");
export const MagicIcon = createIcon("magic");
export const OpenSourceInitiativeIcon = createIcon("openSourceInitiative");
export const McpServerIcon = createIcon("mcpServer");
export const MemoCircleCheckIcon = createIcon("memoCircleCheck");
export const MicroscopeIcon = createIcon("microscope");
export const OneHundredIcon = createIcon("oneHundred");
export const PersonRunningIcon = createIcon("personRunning");
export const PlugIcon = createIcon("plug");
export const PrintIcon = createIcon("print");
export const PuzzlePieceIcon = createIcon("puzzlePiece");
export const RulerIcon = createIcon("ruler");
export const LogicAndIcon = createIcon("logicAnd");
export const LogicOrIcon = createIcon("logicOr");
export const LogicNotIcon = createIcon("logicNot");
export const LogicImpliesIcon = createIcon("logicImplies");
export const LogicEquivalentIcon = createIcon("logicEquivalent");
export const LogicForAllIcon = createIcon("logicForAll");
export const LogicExistsIcon = createIcon("logicExists");
export const LogicNextIcon = createIcon("logicNext");
export const LogicUntilIcon = createIcon("logicUntil");
export const LogicBranchingIcon = createIcon("logicBranching");
export const LogicInvariantIcon = createIcon("logicInvariant");
export const LogicCounterexampleIcon = createIcon("logicCounterexample");
export const LogicConstraintIcon = createIcon("logicConstraint");
export const LogicRobustnessIcon = createIcon("logicRobustness");
export const LogicSignalBoundedIcon = createIcon("logicSignalBounded");
export const LogicSignalThresholdIcon = createIcon("logicSignalThreshold");
export const LogicSignalClockIcon = createIcon("logicSignalClock");
export const LogicStateSequenceIcon = createIcon("logicStateSequence");
export const LogicTemporalOperatorsIcon = createIcon("logicTemporalOperators");
export const LogicBooleanTraceIcon = createIcon("logicBooleanTrace");
export const SortDownIcon = createIcon("sortDown");
export const SortDownAlphabeticalIcon = createIcon("sortDownAlphabetical");
export const SortDownBooleanIcon = createIcon("sortDownBoolean");
export const SortDownDateIcon = createIcon("sortDownDate");
export const SortDownDurationIcon = createIcon("sortDownDuration");
export const SortDownEmptyValuesIcon = createIcon("sortDownEmptyValues");
export const SortDownPriorityIcon = createIcon("sortDownPriority");
export const SortDownNumericIcon = createIcon("sortDownNumeric");
export const SortDownShapesIcon = createIcon("sortDownShapes");
export const SortDownSizeIcon = createIcon("sortDownSize");
export const SortUpIcon = createIcon("sortUp");
export const SortUpAlphabeticalIcon = createIcon("sortUpAlphabetical");
export const SortUpBooleanIcon = createIcon("sortUpBoolean");
export const SortUpDateIcon = createIcon("sortUpDate");
export const SortUpDurationIcon = createIcon("sortUpDuration");
export const SortUpEmptyValuesIcon = createIcon("sortUpEmptyValues");
export const SortUpPriorityIcon = createIcon("sortUpPriority");
export const SortUpNumericIcon = createIcon("sortUpNumeric");
export const SortUpShapesIcon = createIcon("sortUpShapes");
export const SortUpSizeIcon = createIcon("sortUpSize");
export const SquareCheckIcon = createIcon("squareCheck");
export const StarIcon = createIcon("star");
export const ThoughtBubbleIcon = createIcon("thoughtBubble");
export const TruckIcon = createIcon("truck");
export const UserPlusIcon = createIcon("userPlus");

export const hashIconPack = {
  monitoringInstrument: MonitoringInstrumentIcon,
  sensor: SensorIcon,
  methane: MethaneIcon,
  carbonDioxide: CarbonDioxideIcon,
  oxygen: OxygenIcon,
  carbonMonoxide: CarbonMonoxideIcon,
  hydrogenSulfide: HydrogenSulfideIcon,
  sulfurDioxide: SulfurDioxideIcon,
  organicCompound: OrganicCompoundIcon,
  radiation: RadiationIcon,
  waterLevel: WaterLevelIcon,
  waterSplash: WaterSplashIcon,
  particulateMatter1: ParticulateMatter1Icon,
  particulateMatter2Point5: ParticulateMatter2Point5Icon,
  particulateMatter10: ParticulateMatter10Icon,
  particulateMatterTotal: ParticulateMatterTotalIcon,
  pressureDifferential: PressureDifferentialIcon,
  fluidFlow: FluidFlowIcon,
  dewPoint: DewPointIcon,
  cloudRain: CloudRainIcon,
  battery: BatteryIcon,
  batteryLow: BatteryLowIcon,
  batteryLevel: BatteryLevelIcon,
  batteryBolt: BatteryBoltIcon,
  signalStrength: SignalStrengthIcon,
  bookmark: BookmarkIcon,
  cloudLightning: CloudLightningIcon,
  cloudSun: CloudSunIcon,
  contactCard: ContactCardIcon,
  folderOpen: FolderOpenIcon,
  ghost: GhostIcon,
  hardDrive: HardDriveIcon,
  heartPulse: HeartPulseIcon,
  imagePlus: ImagePlusIcon,
  locationPlus: LocationPlusIcon,
  router: RouterIcon,
  cloudUpload: CloudUploadIcon,
  move: MoveIcon,

  openSourceInitiative: OpenSourceInitiativeIcon,
  toolbox: ToolboxIcon,
  tools: ToolsIcon,
  wind: WindIcon,
  flame: FlameIcon,
  circleThreeQuarters: CircleThreeQuartersIcon,
  circleHalf: CircleHalfIcon,
  chartHeatmap: ChartHeatmapIcon,
  chartScatter: ChartScatterIcon,
  boxOpen: BoxOpenIcon,
  cloud: CloudIcon,
  circleTag: CircleTagIcon,
  circleAsterisk: CircleAsteriskIcon,
  flag: FlagIcon,
  diceD20: DiceD20Icon,
  circleFour: CircleFourIcon,
  circleThree: CircleThreeIcon,
  circleTwo: CircleTwoIcon,
  survey: SurveyIcon,
  specification: SpecificationIcon,
  plugCheck: PlugCheckIcon,
  targetArrow: TargetArrowIcon,
  layerPlus: LayerPlusIcon,
  gridPlus: GridPlusIcon,
  entityEdit: EntityEditIcon,
  entityPlus: EntityPlusIcon,
  entity: EntityIcon,
  typeInheritance: TypeInheritanceIcon,
  tableTree: TableTreeIcon,
  timelineArrow: TimelineArrowIcon,
  timeline: TimelineIcon,
  workflow: WorkflowIcon,
  sitemap: SitemapIcon,
  diagramSankey: DiagramSankeyIcon,
  hexagonNodes: HexagonNodesIcon,
  chartNetwork: ChartNetworkIcon,
  cctvCamera: CctvCameraIcon,
  tombstone: TombstoneIcon,
  teddyBear: TeddyBearIcon,
  partyHorn: PartyHornIcon,
  cookie: CookieIcon,
  pizza: PizzaIcon,
  palmTree: PalmTreeIcon,
  lifeRing: LifeRingIcon,
  lighthouse: LighthouseIcon,
  hammer: HammerIcon,
  trophy: TrophyIcon,
  gem: GemIcon,
  swatchBook: SwatchBookIcon,
  palette: PaletteIcon,
  rocket: RocketIcon,
  telescope: TelescopeIcon,
  binoculars: BinocularsIcon,
  mortarPestle: MortarPestleIcon,
  flaskVial: FlaskVialIcon,
  testTubes: TestTubesIcon,
  biohazard: BiohazardIcon,
  virus: VirusIcon,
  atom: AtomIcon,
  solarSystem: SolarSystemIcon,
  orbit: OrbitIcon,
  radar: RadarIcon,
  antenna: AntennaIcon,
  thermometerCold: ThermometerColdIcon,
  thermometerHot: ThermometerHotIcon,
  thermometer: ThermometerIcon,
  humidity: HumidityIcon,
  vibration: VibrationIcon,
  signal: SignalIcon,
  wavePulse: WavePulseIcon,
  waves: WavesIcon,
  sunMoon: SunMoonIcon,
  moon: MoonIcon,
  sun: SunIcon,
  gauge: GaugeIcon,
  presentationChart: PresentationChartIcon,
  pieChart: PieChartIcon,
  chartMixed: ChartMixedIcon,
  chartRevenue: ChartRevenueIcon,
  receipt: ReceiptIcon,
  handDollar: HandDollarIcon,
  moneyTransfer: MoneyTransferIcon,
  coins: CoinsIcon,
  dollar: DollarIcon,
  towerControl: TowerControlIcon,
  truckPlane: TruckPlaneIcon,
  planeArrival: PlaneArrivalIcon,
  planeDeparture: PlaneDepartureIcon,
  planeTail: PlaneTailIcon,
  jet: JetIcon,
  planeUp: PlaneUpIcon,
  plane: PlaneIcon,
  gift: GiftIcon,
  shoppingBasket: ShoppingBasketIcon,
  shoppingCart: ShoppingCartIcon,
  truckRamp: TruckRampIcon,
  truckFast: TruckFastIcon,
  truckContainer: TruckContainerIcon,
  personDolly: PersonDollyIcon,
  forklift: ForkliftIcon,
  conveyorBelt: ConveyorBeltIcon,
  shelves: ShelvesIcon,
  boxLocation: BoxLocationIcon,
  boxesPacking: BoxesPackingIcon,
  pack: PackIcon,
  boxes: BoxesIcon,
  box: BoxIcon,
  graduationCap: GraduationCapIcon,
  briefcase: BriefcaseIcon,
  route: RouteIcon,
  globeStand: GlobeStandIcon,
  globePointer: GlobePointerIcon,
  globeNodes: GlobeNodesIcon,
  globe: GlobeIcon,
  crosshairs: CrosshairsIcon,
  compass: CompassIcon,
  mapPin: MapPinIcon,
  map: MapIcon,
  locationCheck: LocationCheckIcon,
  location: LocationIcon,
  shop: ShopIcon,
  warehouse: WarehouseIcon,
  factory: FactoryIcon,
  bank: BankIcon,
  home: HomeIcon,
  city: CityIcon,
  buildingShield: BuildingShieldIcon,
  buildingSearch: BuildingSearchIcon,
  building: BuildingIcon,
  pullRequest: PullRequestIcon,
  codeBranch: CodeBranchIcon,
  codeEdit: CodeEditIcon,
  cloudDownload: CloudDownloadIcon,
  binary: BinaryIcon,
  scanner: ScannerIcon,
  scanLine: ScanLineIcon,
  magneticMedia: MagneticMediaIcon,
  devices: DevicesIcon,
  calculator: CalculatorIcon,
  creditCard: CreditCardIcon,
  microchip: MicrochipIcon,
  database: DatabaseIcon,
  server: ServerIcon,
  app: AppIcon,
  browser: BrowserIcon,
  laptop: LaptopIcon,
  monitor: MonitorIcon,
  brain: BrainIcon,
  heart: HeartIcon,
  sad: SadIcon,
  smile: SmileIcon,
  handshake: HandshakeIcon,
  thumbsDown: ThumbsDownIcon,
  thumbsUp: ThumbsUpIcon,
  hospitalUser: HospitalUserIcon,
  expertInterviews: ExpertInterviewsIcon,
  peopleArrows: PeopleArrowsIcon,
  family: FamilyIcon,
  personBooth: PersonBoothIcon,
  personPortal: PersonPortalIcon,
  personSign: PersonSignIcon,
  personGreeting: PersonGreetingIcon,
  accessibility: AccessibilityIcon,
  person: PersonIcon,
  userBountyHunter: UserBountyHunterIcon,
  userTag: UserTagIcon,
  userSearch: UserSearchIcon,
  userLock: UserLockIcon,
  userTie: UserTieIcon,
  users: UsersIcon,
  searchChart: SearchChartIcon,
  searchDollar: SearchDollarIcon,
  searchEmpty: SearchEmptyIcon,
  searchCheck: SearchCheckIcon,
  speaker: SpeakerIcon,
  phoneOff: PhoneOffIcon,
  phone: PhoneIcon,
  megaphone: MegaphoneIcon,
  shareNodes: ShareNodesIcon,
  share: ShareIcon,
  send: SendIcon,
  inbox: InboxIcon,
  messageQuestion: MessageQuestionIcon,
  messageDollar: MessageDollarIcon,
  message: MessageIcon,
  mailUnread: MailUnreadIcon,
  mail: MailIcon,
  ballotCheck: BallotCheckIcon,
  badgeCheck: BadgeCheckIcon,
  shieldAlert: ShieldAlertIcon,
  shieldCheck: ShieldCheckIcon,
  listTimeline: ListTimelineIcon,
  listCheck: ListCheckIcon,
  listOrdered: ListOrderedIcon,
  quote: QuoteIcon,
  textAlignJustify: TextAlignJustifyIcon,
  textAlignCenter: TextAlignCenterIcon,
  textAlignRight: TextAlignRightIcon,
  textAlignLeft: TextAlignLeftIcon,
  percent: PercentIcon,
  hashtag: HashtagIcon,
  fontCase: FontCaseIcon,
  fontDraw: FontDrawIcon,
  fontMono: FontMonoIcon,
  fontSerif: FontSerifIcon,
  fontSans: FontSansIcon,
  strikethrough: StrikethroughIcon,
  underline: UnderlineIcon,
  italic: ItalicIcon,
  bold: BoldIcon,
  mixed: MixedIcon,
  splitView: SplitViewIcon,
  rows: RowsIcon,
  columns: ColumnsIcon,
  rectanglesMixed: RectanglesMixedIcon,
  sendToBack: SendToBackIcon,
  bringToFront: BringToFrontIcon,
  sendBackward: SendBackwardIcon,
  bringForward: BringForwardIcon,
  ungroup: UngroupIcon,
  group: GroupIcon,
  stackVertical: StackVerticalIcon,
  stackHorizontal: StackHorizontalIcon,
  distributeVertical: DistributeVerticalIcon,
  distributeHorizontal: DistributeHorizontalIcon,
  alignBottomRight: AlignBottomRightIcon,
  alignBottomCenter: AlignBottomCenterIcon,
  alignBottomLeft: AlignBottomLeftIcon,
  alignCenterRight: AlignCenterRightIcon,
  alignCenterCenter: AlignCenterCenterIcon,
  alignCenterLeft: AlignCenterLeftIcon,
  alignTopRight: AlignTopRightIcon,
  alignTopCenter: AlignTopCenterIcon,
  alignTopLeft: AlignTopLeftIcon,
  alignCenterVertical: AlignCenterVerticalIcon,
  alignCenterHorizontal: AlignCenterHorizontalIcon,
  alignBottom: AlignBottomIcon,
  alignTop: AlignTopIcon,
  alignRight: AlignRightIcon,
  alignLeft: AlignLeftIcon,
  sizeExtraLarge: SizeExtraLargeIcon,
  sizeLarge: SizeLargeIcon,
  sizeMedium: SizeMediumIcon,
  sizeSmall: SizeSmallIcon,
  fillPattern: FillPatternIcon,
  fillSemi: FillSemiIcon,
  fillSolid: FillSolidIcon,
  fillNone: FillNoneIcon,
  pencilRuler: PencilRulerIcon,
  pencilSlash: PencilSlashIcon,
  highlighter: HighlighterIcon,
  eraser: EraserIcon,
  canvas: CanvasIcon,
  aspectRatio: AspectRatioIcon,
  frame: FrameIcon,
  roundedCorner: RoundedCornerIcon,
  splineCubic: SplineCubicIcon,
  splineLine: SplineLineIcon,
  dashDraw: DashDrawIcon,
  dashDotted: DashDottedIcon,
  dashDashed: DashDashedIcon,
  dashSolid: DashSolidIcon,
  arrowheadNone: ArrowheadNoneIcon,
  arrowheadTriangleInverted: ArrowheadTriangleInvertedIcon,
  arrowheadTriangle: ArrowheadTriangleIcon,
  arrowheadSquare: ArrowheadSquareIcon,
  arrowheadDot: ArrowheadDotIcon,
  arrowheadDiamond: ArrowheadDiamondIcon,
  arrowheadBar: ArrowheadBarIcon,
  arrowheadArrow: ArrowheadArrowIcon,
  shapeArrowUp: ShapeArrowUpIcon,
  shapeArrowLeft: ShapeArrowLeftIcon,
  shapeArrowDown: ShapeArrowDownIcon,
  shapeArrowRight: ShapeArrowRightIcon,
  blob: BlobIcon,
  trapezoid: TrapezoidIcon,
  parallelogram: ParallelogramIcon,
  octagon: OctagonIcon,
  hexagon: HexagonIcon,
  pentagon: PentagonIcon,
  triangle: TriangleIcon,
  diamond: DiamondIcon,
  ellipse: EllipseIcon,
  rectangle: RectangleIcon,
  key: KeyIcon,
  paperclip: PaperclipIcon,
  keyboard: KeyboardIcon,
  keycapA: KeycapAIcon,
  keycapB: KeycapBIcon,
  keycapC: KeycapCIcon,
  keycapD: KeycapDIcon,
  keycapE: KeycapEIcon,
  keycapF: KeycapFIcon,
  keycapG: KeycapGIcon,
  keycapH: KeycapHIcon,
  keycapI: KeycapIIcon,
  keycapJ: KeycapJIcon,
  keycapK: KeycapKIcon,
  keycapL: KeycapLIcon,
  keycapM: KeycapMIcon,
  keycapN: KeycapNIcon,
  keycapO: KeycapOIcon,
  keycapP: KeycapPIcon,
  keycapQ: KeycapQIcon,
  keycapR: KeycapRIcon,
  keycapS: KeycapSIcon,
  keycapT: KeycapTIcon,
  keycapU: KeycapUIcon,
  keycapV: KeycapVIcon,
  keycapW: KeycapWIcon,
  keycapX: KeycapXIcon,
  keycapY: KeycapYIcon,
  keycapZ: KeycapZIcon,
  keycap0: Keycap0Icon,
  keycap1: Keycap1Icon,
  keycap2: Keycap2Icon,
  keycap3: Keycap3Icon,
  keycap4: Keycap4Icon,
  keycap5: Keycap5Icon,
  keycap6: Keycap6Icon,
  keycap7: Keycap7Icon,
  keycap8: Keycap8Icon,
  keycap9: Keycap9Icon,
  keycapBacktick: KeycapBacktickIcon,
  keycapTilde: KeycapTildeIcon,
  keycapExclamation: KeycapExclamationIcon,
  keycapAt: KeycapAtIcon,
  keycapHash: KeycapHashIcon,
  keycapDollar: KeycapDollarIcon,
  keycapPercent: KeycapPercentIcon,
  keycapCaret: KeycapCaretIcon,
  keycapAmpersand: KeycapAmpersandIcon,
  keycapAsterisk: KeycapAsteriskIcon,
  keycapParenLeft: KeycapParenLeftIcon,
  keycapParenRight: KeycapParenRightIcon,
  keycapMinus: KeycapMinusIcon,
  keycapUnderscore: KeycapUnderscoreIcon,
  keycapPlus: KeycapPlusIcon,
  keycapEquals: KeycapEqualsIcon,
  keycapBracketLeft: KeycapBracketLeftIcon,
  keycapBracketRight: KeycapBracketRightIcon,
  keycapBraceLeft: KeycapBraceLeftIcon,
  keycapBraceRight: KeycapBraceRightIcon,
  keycapBackslash: KeycapBackslashIcon,
  keycapPipe: KeycapPipeIcon,
  keycapSemicolon: KeycapSemicolonIcon,
  keycapColon: KeycapColonIcon,
  keycapQuote: KeycapQuoteIcon,
  keycapDoubleQuote: KeycapDoubleQuoteIcon,
  keycapComma: KeycapCommaIcon,
  keycapPeriod: KeycapPeriodIcon,
  keycapSlash: KeycapSlashIcon,
  keycapQuestion: KeycapQuestionIcon,
  keycapLessThan: KeycapLessThanIcon,
  keycapGreaterThan: KeycapGreaterThanIcon,
  keycapF1: KeycapF1Icon,
  keycapF2: KeycapF2Icon,
  keycapF3: KeycapF3Icon,
  keycapF4: KeycapF4Icon,
  keycapF5: KeycapF5Icon,
  keycapF6: KeycapF6Icon,
  keycapF7: KeycapF7Icon,
  keycapF8: KeycapF8Icon,
  keycapF9: KeycapF9Icon,
  keycapF10: KeycapF10Icon,
  keycapF11: KeycapF11Icon,
  keycapF12: KeycapF12Icon,
  keycapEscape: KeycapEscapeIcon,
  keycapAlt: KeycapAltIcon,
  keycapFn: KeycapFnIcon,
  keycapInsert: KeycapInsertIcon,
  keycapPrintScreen: KeycapPrintScreenIcon,
  keycapCommand: KeycapCommandIcon,
  keycapShift: KeycapShiftIcon,
  keycapControl: KeycapControlIcon,
  keycapOption: KeycapOptionIcon,
  keycapWindows: KeycapWindowsIcon,
  keycapTab: KeycapTabIcon,
  keycapEnter: KeycapEnterIcon,
  keycapBackspace: KeycapBackspaceIcon,
  keycapDelete: KeycapDeleteIcon,
  keycapSpace: KeycapSpaceIcon,
  keycapCapsLock: KeycapCapsLockIcon,
  keycapArrowUp: KeycapArrowUpIcon,
  keycapArrowDown: KeycapArrowDownIcon,
  keycapArrowLeft: KeycapArrowLeftIcon,
  keycapArrowRight: KeycapArrowRightIcon,
  keycapHome: KeycapHomeIcon,
  keycapEnd: KeycapEndIcon,
  keycapPageUp: KeycapPageUpIcon,
  keycapPageDown: KeycapPageDownIcon,
  keycapPause: KeycapPauseIcon,
  keycapNumLock: KeycapNumLockIcon,
  keycapScrollLock: KeycapScrollLockIcon,
  keycapMenu: KeycapMenuIcon,
  keycapEject: KeycapEjectIcon,
  command: CommandIcon,
  toggleOff: ToggleOffIcon,
  toggleOn: ToggleOnIcon,
  power: PowerIcon,
  tag: TagIcon,
  pin: PinIcon,
  dot: DotIcon,
  help: HelpIcon,
  equals: EqualsIcon,
  checkDouble: CheckDoubleIcon,
  radioChecked: RadioCheckedIcon,
  squareMinus: SquareMinusIcon,
  squareClose: SquareCloseIcon,
  circlePlay: CirclePlayIcon,
  circleUp: CircleUpIcon,
  circleArrowUpRight: CircleArrowUpRightIcon,
  circleArrowRight: CircleArrowRightIcon,
  arrowPointer: ArrowPointerIcon,
  shuffle: ShuffleIcon,
  redo: RedoIcon,
  collapseVertical: CollapseVerticalIcon,
  expandDiagonal: ExpandDiagonalIcon,
  expandVertical: ExpandVerticalIcon,
  expandHorizontal: ExpandHorizontalIcon,
  chevronsUpDown: ChevronsUpDownIcon,
  arrowProgress: ArrowProgressIcon,
  arrowTurnDownRight: ArrowTurnDownRightIcon,
  arrowTurnDownLeft: ArrowTurnDownLeftIcon,
  logout: LogoutIcon,
  login: LoginIcon,
  upload: UploadIcon,
  historyUser: HistoryUserIcon,
  historyPages: HistoryPagesIcon,
  calendars: CalendarsIcon,
  calendarCheck: CalendarCheckIcon,
  calendarDays: CalendarDaysIcon,
  calendarWeek: CalendarWeekIcon,
  calendarDay: CalendarDayIcon,
  handwrittenDocs: HandwrittenDocsIcon,
  newspaper: NewspaperIcon,
  books: BooksIcon,
  bookOpen: BookOpenIcon,
  book: BookIcon,
  archive: ArchiveIcon,
  clipboardList: ClipboardListIcon,
  clipboardCheck: ClipboardCheckIcon,
  clipboard: ClipboardIcon,
  memoInfo: MemoInfoIcon,
  notePlus: NotePlusIcon,
  noteSticky: NoteStickyIcon,
  folder: FolderIcon,
  files: FilesIcon,
  fileExport: FileExportIcon,
  fileEdit: FileEditIcon,
  filePlus: FilePlusIcon,
  fileInvoiceDollar: FileInvoiceDollarIcon,
  fileBox: FileBoxIcon,
  fileImage: FileImageIcon,
  fileVideo: FileVideoIcon,
  fileAudio: FileAudioIcon,
  filePdf: FilePdfIcon,
  filePresentation: FilePresentationIcon,
  fileContract: FileContractIcon,
  fileInvoice: FileInvoiceIcon,
  fileText: FileTextIcon,
  fileDocument: FileDocumentIcon,
  fileCode: FileCodeIcon,
  fileArchive: FileArchiveIcon,
  loadingSpinner: LoadingIcon,
  arrowTrendDown: ArrowTrendDownIcon,
  arrowTrendUp: ArrowTrendUpIcon,
  asterisk: AsteriskIcon,
  at: AtIcon,
  barcode: BarcodeIcon,
  bell: BellIcon,
  bracketsSquare: BracketsSquareIcon,
  bug: BugIcon,
  calendar: CalendarIcon,
  calendarClock: CalendarClockIcon,
  circleOne: CircleOneIcon,
  cubes: CubesIcon,
  diagramNodes: DiagramNodesIcon,
  diagramSubtask: DiagramSubtaskIcon,
  diamondExclamation: DiamondExclamationIcon,
  emptySet: EmptySetIcon,
  feather: FeatherIcon,
  fileSpreadsheet: FileSpreadsheetIcon,
  gripVertical: GripVerticalIcon,
  image: ImageIcon,
  inputPipe: InputPipeIcon,
  lightbulbOn: LightbulbOnIcon,
  listTree: ListTreeIcon,
  magic: MagicIcon,
  memoCircleCheck: MemoCircleCheckIcon,
  microscope: MicroscopeIcon,
  oneHundred: OneHundredIcon,
  personRunning: PersonRunningIcon,
  plug: PlugIcon,
  print: PrintIcon,
  puzzlePiece: PuzzlePieceIcon,
  ruler: RulerIcon,
  logicAnd: LogicAndIcon,
  logicOr: LogicOrIcon,
  logicNot: LogicNotIcon,
  logicImplies: LogicImpliesIcon,
  logicEquivalent: LogicEquivalentIcon,
  logicForAll: LogicForAllIcon,
  logicExists: LogicExistsIcon,
  logicNext: LogicNextIcon,
  logicUntil: LogicUntilIcon,
  logicBranching: LogicBranchingIcon,
  logicInvariant: LogicInvariantIcon,
  logicCounterexample: LogicCounterexampleIcon,
  logicConstraint: LogicConstraintIcon,
  logicRobustness: LogicRobustnessIcon,
  logicSignalBounded: LogicSignalBoundedIcon,
  logicSignalThreshold: LogicSignalThresholdIcon,
  logicSignalClock: LogicSignalClockIcon,
  logicStateSequence: LogicStateSequenceIcon,
  logicTemporalOperators: LogicTemporalOperatorsIcon,
  logicBooleanTrace: LogicBooleanTraceIcon,
  sortDown: SortDownIcon,
  sortDownAlphabetical: SortDownAlphabeticalIcon,
  sortDownBoolean: SortDownBooleanIcon,
  sortDownDate: SortDownDateIcon,
  sortDownDuration: SortDownDurationIcon,
  sortDownEmptyValues: SortDownEmptyValuesIcon,
  sortDownPriority: SortDownPriorityIcon,
  sortDownNumeric: SortDownNumericIcon,
  sortDownShapes: SortDownShapesIcon,
  sortDownSize: SortDownSizeIcon,
  sortUp: SortUpIcon,
  sortUpAlphabetical: SortUpAlphabeticalIcon,
  sortUpBoolean: SortUpBooleanIcon,
  sortUpDate: SortUpDateIcon,
  sortUpDuration: SortUpDurationIcon,
  sortUpEmptyValues: SortUpEmptyValuesIcon,
  sortUpPriority: SortUpPriorityIcon,
  sortUpNumeric: SortUpNumericIcon,
  sortUpShapes: SortUpShapesIcon,
  sortUpSize: SortUpSizeIcon,
  squareCheck: SquareCheckIcon,
  star: StarIcon,
  thoughtBubble: ThoughtBubbleIcon,
  truck: TruckIcon,
  userPlus: UserPlusIcon,
  starFilled: createIcon("star", "filled"),
  infinity: InfinityIcon,
  arrowUp: ArrowUpIcon,
  arrowDown: ArrowDownIcon,
  arrowLeft: ArrowLeftIcon,
  arrowRight: ArrowRightIcon,
  arrowUpRight: ArrowUpRightIcon,
  arrowsLeftRight: ArrowsLeftRightIcon,
  trash: TrashIcon,
  pencil: PencilIcon,
  copy: CopyIcon,
  download: DownloadIcon,
  externalLink: ExternalLinkIcon,
  link: LinkIcon,
  linkBroken: LinkBrokenIcon,
  ellipsis: EllipsisIcon,
  ellipsisVertical: EllipsisVerticalIcon,
  circleEllipsis: CircleEllipsisIcon,
  collapse: CollapseIcon,
  lockOpen: LockOpenIcon,
  lockClosed: LockClosedIcon,
  eye: EyeIcon,
  eyeSlash: EyeSlashIcon,
  clock: ClockIcon,
  clockRotateLeft: ClockRotateLeftIcon,
  rotate: RotateIcon,
  rightToLine: RightToLineIcon,
  flask: FlaskIcon,
  layer: LayerIcon,
  chartBarSimple: ChartBarSimpleIcon,
  chartLine: ChartLineIcon,
  filter: FilterIcon,
  bracketsCurly: BracketsCurlyIcon,
  lambda: LambdaIcon,
  lightning: LightningIcon,
  code: CodeIcon,
  cube: CubeIcon,
  diagramNested: DiagramNestedIcon,
  diagramProject: DiagramProjectIcon,
  shapes: ShapesIcon,
  file: FileIcon,
  fileLines: FileLinesIcon,
  list: ListIcon,
  table: TableIcon,
  grid: GridIcon,
  bullseye: BullseyeIcon,
  scribble: ScribbleIcon,
  sparkles: SparklesIcon,
  info: InfoIcon,
  error: ErrorIcon,
  warning: WarningIcon,
  circleCheck: CircleCheckIcon,
  circleClose: CircleCloseIcon,
  terminal: TerminalIcon,
  text: TextIcon,
  user: UserIcon,
  edit: PencilIcon,
  chartBar: ChartBarSimpleIcon,
  refresh: RotateIcon,
  caretDown: ChevronDownIcon,
  chevronDownHeavy: ChevronDownIcon,
  chevronUpHeavy: ChevronUpIcon,
  chevronLeftHeavy: ChevronLeftIcon,
  chevronRightHeavy: ChevronRightIcon,
  sidebar: SidebarIcon,
  bars: MenuIcon,
  hand: HandIcon,
  cursor: CursorIcon,
  circlePlus: AddPlaceIcon,
  squarePlus: AddTransitionIcon,
  gear: SettingsIcon,
  circle: PlaceIcon,
  circleFilled: createIcon("place", "filled"),
  square: TransitionIcon,
  squareFilled: createIcon("transition", "filled"),
  threeCircles: TokenTypeIcon,
  sliders: ParameterIcon,
  function: FunctionIcon,
  play: PlayIcon,
  playFilled: createIcon("play", "filled"),
  pause: PauseIcon,
  pauseFilled: createIcon("pause", "filled"),
  skipForward: StepForwardIcon,
  skipForwardFilled: createIcon("stepForward", "filled"),
  stop: StopIcon,
  stopFilled: createIcon("stop", "filled"),
  rotateLeft: ResetIcon,
  undo: ResetIcon,
  plus: PlusIcon,
  dash: MinusIcon,
  close: CloseIcon,
  check: CheckIcon,
  search: SearchIcon,
  zoomIn: ZoomInIcon,
  zoomOut: ZoomOutIcon,
  expand: FitViewIcon,
  chevronUp: ChevronUpIcon,
  chevronDown: ChevronDownIcon,
  chevronLeft: ChevronLeftIcon,
  chevronRight: ChevronRightIcon,
} satisfies Record<string, ComponentType<HashIconComponentProps>>;

export const HashIconProvider = ({
  enabled,
  children,
  ...defaults
}: PropsWithChildren<HashIconDefaults & { enabled?: boolean }>) => {
  const parentDefaults = use(HashIconContext);
  const resolvedEnabled = enabled ?? parentDefaults.enabled ?? true;
  return (
    <HashIconContext
      value={{ ...parentDefaults, ...defaults, enabled: resolvedEnabled }}
    >
      {children}
    </HashIconContext>
  );
};

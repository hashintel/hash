import { createContext, use } from "react";

import { IconProvider, type IconPack } from "@hashintel/ds-components";

import { AddNodeGeometry } from "./experimental-icons/add-node-geometry";
import { additionalGeometry } from "./experimental-icons/additional-geometry";
import { explorationGeometry } from "./experimental-icons/exploration-geometry";
import { IconInteraction } from "./experimental-icons/interaction";
import { modelingGeometry } from "./experimental-icons/modeling-geometry";
import {
  experimentalIconEffects,
  getIconTransition,
  resolveIconDuration,
  useIconEffects,
  useIconMotionAllowed,
} from "./experimental-icons/motion";
import { ParameterGeometry } from "./experimental-icons/parameter-geometry";
import { SettingsGeometry } from "./experimental-icons/settings-geometry";
import { ShapesGeometry } from "./experimental-icons/shapes-geometry";
import { IconMotionLayer } from "./experimental-icons/shared/icon-motion-layer";
import { SidebarGeometry } from "./experimental-icons/sidebar-geometry";
import {
  FlaskGeometry,
  LayerGeometry,
} from "./experimental-icons/simulation-geometry";
import {
  DiagnosticsGeometry,
  MenuGeometry,
  MicrophoneGeometry,
  PauseGeometry,
  PlaybackGeometry,
} from "./experimental-icons/state-geometry";
import { utilityGeometry } from "./experimental-icons/utility-geometry";

import type { ExperimentalIconBadgeVisibility } from "./experimental-icons/add-node-geometry";
import type {
  ExperimentalIconMotion,
  ExperimentalIconTransition,
  IconMotionProps,
} from "./experimental-icons/motion";
import type { ExperimentalIconStatus } from "./experimental-icons/state-geometry";
import type { PropsWithChildren, SVGProps } from "react";

export { petriconHints } from "./experimental-icons/shared/petricon-hints";

export { experimentalIconEffects } from "./experimental-icons/motion";
export type { ExperimentalIconStatus } from "./experimental-icons/state-geometry";
export type { ExperimentalIconBadgeVisibility } from "./experimental-icons/add-node-geometry";
export type {
  ExperimentalIconEffect,
  ExperimentalIconMotion,
  ExperimentalIconTransition,
  ExperimentalIconChoreography,
} from "./experimental-icons/motion";

export type ExperimentalIconVariant = "outline" | "filled";

export type ExperimentalIconDefaults = {
  size?: number;
  /** Stroke weight from 100 to 700, with 400 as the default. */
  weight?: number;
  color?: string;
  motion?: ExperimentalIconMotion;
  duration?: number;
};

const ExperimentalIconContext = createContext<
  ExperimentalIconDefaults & { enabled?: boolean }
>({});

export const useExperimentalIconPackEnabled = () =>
  use(ExperimentalIconContext).enabled ?? false;

export const useExperimentalIconMotionAllowed = () =>
  useIconMotionAllowed(use(ExperimentalIconContext).motion ?? "auto");

const searchGeometry = (
  <g fill="none">
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 4.5 4.5" />
  </g>
);

const geometry = {
  ...additionalGeometry,
  ...utilityGeometry,
  ...explorationGeometry,
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
    <>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V4a1.5 1.5 0 0 1 3 0v1.5a1.5 1.5 0 0 1 3 0v2a1.5 1.5 0 0 1 3 0V14c0 4.5-2.5 7-6.5 7h-.75c-2 0-3.75-.8-5.25-2.25L3.75 14a1.5 1.5 0 0 1 2.1-2.1L8 14.1Z" />
      <path d="M11 5.5V11m3-5.5V11m3-3.5V12" fill="none" />
    </>
  ),
  cursor: <path d="M5 5 19.5 11.5 13 13 11.5 19.5Z" />,
  place: <circle cx="12" cy="12" r="8" />,
  transition: <rect x="4" y="4" width="16" height="16" rx="2" />,
  addPlace: null,
  addTransition: null,
  settings: null,
  parameter: null,
  function: (
    <path d="M7 20h1c2 0 2.5-2 3-5l1-6c.5-3 1-5 3-5h2M7 10h10" fill="none" />
  ),
  play: <path d="M7 4.5 20 12 7 19.5Z" />,
  pause: <PauseGeometry />,
  stepForward: (
    <>
      <path d="m5 5.5 10 6.5-10 6.5Z" />
      <path d="M19 5v14" fill="none" />
    </>
  ),
  stop: <rect x="4" y="4" width="16" height="16" rx="2" />,
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
  chevronUp: <path d="m6 15 6-6 6 6" fill="none" />,
  chevronDown: <path d="m6 9 6 6 6-6" fill="none" />,
  chevronLeft: <path d="m15 6-6 6 6 6" fill="none" />,
  chevronRight: <path d="m9 6 6 6-6 6" fill="none" />,
  ...modelingGeometry,
} as const;

export type ExperimentalIconName = keyof typeof geometry;

const stateTransitionIcons: readonly ExperimentalIconName[] = [
  "addPlace",
  "addTransition",
  "sidebar",
  "settings",
  "flask",
  "layer",
  "shapes",
  "diagnostics",
];

export const getExperimentalIconEffects = (name: ExperimentalIconName) =>
  experimentalIconEffects.filter((effect) => {
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

export const experimentalIconNames = Object.keys(
  geometry,
) as ExperimentalIconName[];

export type ExperimentalIconProps = ExperimentalIconDefaults &
  IconMotionProps &
  Omit<SVGProps<SVGSVGElement>, "children" | "name"> & {
    name: ExperimentalIconName;
    variant?: ExperimentalIconVariant;
    selected?: boolean;
    collapsed?: boolean;
    open?: boolean;
    playing?: boolean;
    muted?: boolean;
    status?: ExperimentalIconStatus;
    hover?: "auto" | "none";
    interaction?: "auto" | "none";
    badge?: ExperimentalIconBadgeVisibility;
    transition?: ExperimentalIconTransition;
  };

export const ExperimentalIcon = ({
  name,
  size,
  weight,
  color,
  variant = "outline",
  strokeWidth,
  effect,
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
}: ExperimentalIconProps) => {
  const defaults = use(ExperimentalIconContext);
  const motionAllowed = useIconMotionAllowed(
    motion ?? defaults.motion ?? "auto",
  );
  const resolvedDuration = resolveIconDuration(
    duration ?? defaults.duration ?? 600,
  );
  const drawing =
    drawProgress !== undefined ||
    (typeof effect === "string" ? effect === "draw" : effect?.includes("draw"));
  const hoverAllowed = motionAllowed && hover === "auto" && !drawing;
  const motionRef = useIconEffects({
    effect,
    trigger,
    active,
    duration: resolvedDuration,
    choreography,
    allowed: motionAllowed,
    identity: `${name}:${variant}`,
    name,
    interactive: interaction === "auto" && !drawing,
    authoredHover: hoverAllowed && name in modelingGeometry,
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
  const resolvedStrokeWidth = strokeWidth ?? 1 + (resolvedWeight - 100) / 300;
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
      strokeLinecap="round"
      strokeLinejoin="round"
      color={color ?? defaults.color ?? "currentColor"}
      role={labelled ? "img" : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      {...props}
      style={{
        ...(name === "diagnostics" ? { transition: resolvedTransition } : {}),
        ...(name === "personRunning" ? { overflow: "visible" } : {}),
        ...props.style,
      }}
      data-icon-pack="petrinaut-experimental"
      data-petricon=""
      data-icon={name}
      data-icon-status={name === "diagnostics" ? status : undefined}
    >
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
            motionAllowed={motionAllowed && hover === "auto"}
            transition={resolvedTransition}
          />
        ) : name === "settings" ? (
          <SettingsGeometry open={open} transition={resolvedTransition} />
        ) : name === "flask" ? (
          <FlaskGeometry
            selected={selected}
            hover={motionAllowed && hover === "auto"}
            filled={variant === "filled"}
            transition={simulationTransition}
            waveDuration={Math.min(resolvedDuration, 480)}
          />
        ) : name === "layer" ? (
          <LayerGeometry
            selected={selected}
            hover={motionAllowed && hover === "auto"}
            filled={variant === "filled"}
            transition={simulationTransition}
          />
        ) : name === "shapes" ? (
          <ShapesGeometry
            selected={selected}
            hover={motionAllowed && hover === "auto"}
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
              enabled={hoverAllowed && !(name in modelingGeometry)}
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
    </svg>
  );
};

export type ExperimentalIconComponentProps = Omit<
  ExperimentalIconProps,
  "name"
>;

const createIcon = (
  name: ExperimentalIconName,
  variant: ExperimentalIconVariant = "outline",
) => {
  const IconComponent = (props: ExperimentalIconComponentProps) => (
    <ExperimentalIcon variant={variant} {...props} name={name} />
  );
  return IconComponent;
};

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
export const TerminalIcon = createIcon("terminal");
export const TextIcon = createIcon("text");
export const UserIcon = createIcon("user");
export const VoiceIcon = createIcon("voice");
export const TranscriptionIcon = createIcon("transcription");
export const AssistantIcon = createIcon("assistant");
export const MicrophoneIcon = createIcon("microphone");
export const PlaybackIcon = createIcon("playback");
export const DiagnosticsIcon = createIcon("diagnostics");
export const LoadingIcon = (props: ExperimentalIconComponentProps) => (
  <ExperimentalIcon
    name="loading"
    effect="rotate"
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
export const MemoCircleCheckIcon = createIcon("memoCircleCheck");
export const MicroscopeIcon = createIcon("microscope");
export const OneHundredIcon = createIcon("oneHundred");
export const PersonRunningIcon = createIcon("personRunning");
export const PlugIcon = createIcon("plug");
export const PrintIcon = createIcon("print");
export const PuzzlePieceIcon = createIcon("puzzlePiece");
export const RulerIcon = createIcon("ruler");
export const SortDownIcon = createIcon("sortDown");
export const SortDownAZIcon = createIcon("sortDownAZ");
export const SortUpIcon = createIcon("sortUp");
export const SortUpAZIcon = createIcon("sortUpAZ");
export const SquareCheckIcon = createIcon("squareCheck");
export const StarIcon = createIcon("star");
export const ThoughtBubbleIcon = createIcon("thoughtBubble");
export const TruckIcon = createIcon("truck");
export const UserPlusIcon = createIcon("userPlus");

export const experimentalIconPack: Required<IconPack> = {
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
  sortDown: SortDownIcon,
  sortDownAZ: SortDownAZIcon,
  sortUp: SortUpIcon,
  sortUpAZ: SortUpAZIcon,
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
};

const defaultIconPack: IconPack = {};

export const ExperimentalIconProvider = ({
  enabled = true,
  children,
  ...defaults
}: PropsWithChildren<ExperimentalIconDefaults & { enabled?: boolean }>) => {
  const parentDefaults = use(ExperimentalIconContext);
  return (
    <ExperimentalIconContext
      value={{ ...parentDefaults, ...defaults, enabled }}
    >
      <IconProvider icons={enabled ? experimentalIconPack : defaultIconPack}>
        {children}
      </IconProvider>
    </ExperimentalIconContext>
  );
};

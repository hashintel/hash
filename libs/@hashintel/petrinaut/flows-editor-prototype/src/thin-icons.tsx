/**
 * Lighter icons for the whole prototype (Aakarsh, 4 Nov: the icons are "too heavy"). The DS draws Font Awesome
 * filled paths, which have no stroke to thin. This pack swaps them, through the DS `IconProvider`, for Lucide line
 * icons (already a ds-components dependency) at an absolute 1.25 px stroke at every size, the status glyphs' stroke.
 *
 * Names with no close Lucide match keep the DS icon. DS gap: the DS has no light icon weight or stroke setting.
 */
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Asterisk,
  AtSign,
  Bell,
  Box,
  Boxes,
  Braces,
  Brackets,
  Bug,
  Calendar,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleEllipsis,
  CirclePlus,
  Clock,
  Code,
  Copy,
  Crosshair,
  Download,
  Ellipsis,
  EllipsisVertical,
  Expand,
  ExternalLink,
  Eye,
  File,
  FileText,
  FlaskConical,
  Funnel,
  GripVertical,
  Hand,
  History,
  Image,
  Infinity as InfinityIcon,
  Info,
  Layers,
  LayoutGrid,
  Lightbulb,
  List,
  ListTree,
  Lock,
  LockOpen,
  type LucideIcon,
  MessageCircle,
  Microscope,
  MousePointer2,
  Network,
  PanelLeft,
  Pause,
  Pencil,
  Play,
  Plug,
  Plus,
  Puzzle,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  Settings,
  Shapes,
  Sigma,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquarePlus,
  Star,
  Table,
  Terminal,
  Trash2,
  TriangleAlert,
  Truck,
  Type,
  Undo2,
  User,
  UserPlus,
  WandSparkles,
  Workflow,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import type { IconProvider } from "@hashintel/ds-components";

type IconPack = React.ComponentProps<typeof IconProvider>["icons"];

/**
 * The stroke in CSS pixels, whatever size the icon is drawn at. The DS sizes icons in CSS, so Lucide's
 * `absoluteStrokeWidth` (which needs the `size` prop) can't hold it; a non-scaling stroke does.
 */
export const iconStroke = 1.25;

const strokeSheetId = "flows-icon-stroke";
if (!globalThis.document.getElementById(strokeSheetId)) {
  const sheet = globalThis.document.createElement("style");
  sheet.id = strokeSheetId;
  sheet.textContent = "svg.lucide * { vector-effect: non-scaling-stroke; }";
  globalThis.document.head.append(sheet);
}

const thin = (Lucide: LucideIcon) => {
  const ThinIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <Lucide strokeWidth={iconStroke} {...props} />
  );
  return ThinIcon;
};

export const thinIcons: IconPack = {
  arrowDown: thin(ArrowDown),
  arrowLeft: thin(ArrowLeft),
  arrowRight: thin(ArrowRight),
  arrowUp: thin(ArrowUp),
  arrowUpRight: thin(ArrowUpRight),
  asterisk: thin(Asterisk),
  at: thin(AtSign),
  bell: thin(Bell),
  bracketsCurly: thin(Braces),
  bracketsSquare: thin(Brackets),
  bug: thin(Bug),
  bullseye: thin(Crosshair),
  calendar: thin(Calendar),
  calendarClock: thin(CalendarClock),
  check: thin(Check),
  chevronDown: thin(ChevronDown),
  chevronLeft: thin(ChevronLeft),
  chevronRight: thin(ChevronRight),
  chevronUp: thin(ChevronUp),
  circle: thin(Circle),
  circleCheck: thin(CircleCheck),
  circleEllipsis: thin(CircleEllipsis),
  circlePlus: thin(CirclePlus),
  clock: thin(Clock),
  clockRotateLeft: thin(History),
  close: thin(X),
  code: thin(Code),
  copy: thin(Copy),
  cube: thin(Box),
  cubes: thin(Boxes),
  cursor: thin(MousePointer2),
  diagramNested: thin(Network),
  diagramProject: thin(Workflow),
  diagramSubtask: thin(Workflow),
  download: thin(Download),
  edit: thin(Pencil),
  ellipsis: thin(Ellipsis),
  ellipsisVertical: thin(EllipsisVertical),
  error: thin(CircleAlert),
  expand: thin(Expand),
  externalLink: thin(ExternalLink),
  eye: thin(Eye),
  file: thin(File),
  fileLines: thin(FileText),
  filter: thin(Funnel),
  flask: thin(FlaskConical),
  function: thin(Sigma),
  gear: thin(Settings),
  grid: thin(LayoutGrid),
  gripVertical: thin(GripVertical),
  hand: thin(Hand),
  image: thin(Image),
  infinity: thin(InfinityIcon),
  info: thin(Info),
  layer: thin(Layers),
  lightbulbOn: thin(Lightbulb),
  lightning: thin(Zap),
  list: thin(List),
  listTree: thin(ListTree),
  lockClosed: thin(Lock),
  lockOpen: thin(LockOpen),
  magic: thin(WandSparkles),
  microscope: thin(Microscope),
  pause: thin(Pause),
  pencil: thin(Pencil),
  play: thin(Play),
  plug: thin(Plug),
  plus: thin(Plus),
  puzzlePiece: thin(Puzzle),
  refresh: thin(RefreshCw),
  rotate: thin(RotateCw),
  rotateLeft: thin(RotateCcw),
  search: thin(Search),
  shapes: thin(Shapes),
  sidebar: thin(PanelLeft),
  skipForward: thin(SkipForward),
  sliders: thin(SlidersHorizontal),
  sortDown: thin(ArrowDownWideNarrow),
  sparkles: thin(Sparkles),
  square: thin(Square),
  squarePlus: thin(SquarePlus),
  star: thin(Star),
  stop: thin(Square),
  table: thin(Table),
  terminal: thin(Terminal),
  text: thin(Type),
  thoughtBubble: thin(MessageCircle),
  trash: thin(Trash2),
  truck: thin(Truck),
  undo: thin(Undo2),
  user: thin(User),
  userPlus: thin(UserPlus),
  warning: thin(TriangleAlert),
  zoomIn: thin(ZoomIn),
  zoomOut: thin(ZoomOut),
};

/**
 * figma-ds `tree-structure` (Icons page, 39907:133922; Phosphor): three boxes, left to right. The code-ds icon set
 * has no such name, so a Button takes it as its `prefix`. Drawn as the pack draws its icons: 16 px in a toolbar
 * Button, the 1.25 px non-scaling stroke.
 */
export const TreeStructureIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={iconStroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="lucide"
    aria-hidden="true"
    style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    {...props}
  >
    <path d="M6 12h4.5M14.25 17.25H12a1.5 1.5 0 0 1-1.5-1.5v-7.5A1.5 1.5 0 0 1 12 6.75h2.25" />
    <rect x="1.5" y="9.75" width="4.5" height="4.5" rx="0.75" />
    <rect x="14.25" y="3.75" width="6" height="6" rx="0.75" />
    <rect x="14.25" y="14.25" width="6" height="6" rx="0.75" />
  </svg>
);

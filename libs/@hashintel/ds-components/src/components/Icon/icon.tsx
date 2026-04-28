/* eslint simple-import-sort/imports: "off", sort-imports: ["error", { ignoreDeclarationSort: true, ignoreMemberSort: true, ignoreCase: false }] */
import { cx } from "@hashintel/ds-helpers/css";
import AngleDown from "./svgs/solid/angle-down.svg";
import AngleRight from "./svgs/regular/angle-right.svg";
import ArrowDown from "./svgs/regular/arrow-down.svg";
import ArrowDownLeftAndArrowUpRightToCenter from "./svgs/solid/arrow-down-left-and-arrow-up-right-to-center.svg";
import ArrowLeft from "./svgs/regular/arrow-left.svg";
import ArrowRight from "./svgs/regular/arrow-right.svg";
import ArrowRotateLeft from "./svgs/regular/arrow-rotate-left.svg";
import ArrowUp from "./svgs/regular/arrow-up.svg";
import ArrowUpRight from "./svgs/regular/arrow-up-right.svg";
import ArrowUpRightAndArrowDownLeftFromCenter from "./svgs/solid/arrow-up-right-and-arrow-down-left-from-center.svg";
import ArrowUpRightFromSquare from "./svgs/regular/arrow-up-right-from-square.svg";
import ArrowUpWideShort from "./svgs/light/arrow-up-wide-short.svg";
import ArrowsRotate from "./svgs/regular/arrows-rotate.svg";
import Asterisk from "./svgs/regular/asterisk.svg";
import At from "./svgs/regular/at.svg";
import Barcode from "./svgs/regular/barcode.svg";
import Bell from "./svgs/light/bell.svg";
import BracketsCurly from "./svgs/regular/brackets-curly.svg";
import BracketsSquare from "./svgs/regular/brackets-square.svg";
import Bug from "./svgs/solid/bug.svg";
import Bullseye from "./svgs/light/bullseye.svg";
import Calendar from "./svgs/regular/calendar.svg";
import CalendarClock from "./svgs/regular/calendar-clock.svg";
import CaretDown from "./svgs/solid/caret-down.svg";
import Check from "./svgs/regular/check.svg";
import Circle from "./svgs/solid/circle.svg";
import CircleCheck from "./svgs/regular/circle-check.svg";
import CircleEllipsis from "./svgs/regular/circle-ellipsis.svg";
import CircleExclamation from "./svgs/solid/circle-exclamation.svg";
import CircleInfo from "./svgs/solid/circle-info.svg";
import CircleNodes from "./svgs/light/circle-nodes.svg";
import CircleOne from "./svgs/regular/circle-1.svg";
import CirclePlus from "./svgs/regular/circle-plus.svg";
import Clock from "./svgs/regular/clock.svg";
import Code from "./svgs/regular/code.svg";
import Copy from "./svgs/regular/copy.svg";
import Cube from "./svgs/regular/cube.svg";
import Cubes from "./svgs/regular/cubes.svg";
import DiagramNested from "./svgs/light/diagram-nested.svg";
import DiagramProject from "./svgs/regular/diagram-project.svg";
import DiagramSubtask from "./svgs/regular/diagram-subtask.svg";
import Download from "./svgs/regular/download.svg";
import EmptySet from "./svgs/regular/empty-set.svg";
import Eye from "./svgs/regular/eye.svg";
import EyeSlash from "./svgs/regular/eye-slash.svg";
import Feather from "./svgs/regular/feather.svg";
import File from "./svgs/regular/file.svg";
import FileSpreadsheet from "./svgs/regular/file-spreadsheet.svg";
import ForwardStep from "./svgs/solid/forward-step.svg";
import Image from "./svgs/regular/image.svg";
import InfinityLoop from "./svgs/light/infinity.svg";
import InputPipe from "./svgs/regular/input-pipe.svg";
import LightbulbOn from "./svgs/regular/lightbulb-on.svg";
import List from "./svgs/regular/list.svg";
import ListTree from "./svgs/regular/list-tree.svg";
import MagnifyingGlass from "./svgs/regular/magnifying-glass.svg";
import MagnifyingGlassMinus from "./svgs/light/magnifying-glass-minus.svg";
import MagnifyingGlassPlus from "./svgs/light/magnifying-glass-plus.svg";
import MemoCircleCheck from "./svgs/regular/memo-circle-check.svg";
import Microscope from "./svgs/regular/microscope.svg";
import Minus from "./svgs/solid/minus.svg";
import OneHundred from "./svgs/regular/100.svg";
import Pen from "./svgs/regular/pen.svg";
import PenToSquare from "./svgs/solid/pen-to-square.svg";
import PersonRunning from "./svgs/regular/person-running.svg";
import Play from "./svgs/solid/play.svg";
import Plug from "./svgs/regular/plug.svg";
import Plus from "./svgs/regular/plus.svg";
import Rotate from "./svgs/regular/rotate.svg";
import Ruler from "./svgs/regular/ruler.svg";
import Shapes from "./svgs/regular/shapes.svg";
import Sidebar from "./svgs/regular/sidebar.svg";
import Sparkles from "./svgs/light/sparkles.svg";
import SquareCheck from "./svgs/regular/square-check.svg";
import Star from "./svgs/regular/star.svg";
import Stop from "./svgs/solid/stop.svg";
import Table from "./svgs/light/table.svg";
import Terminal from "./svgs/light/terminal.svg";
import Text from "./svgs/regular/text.svg";
import ThoughtBubble from "./svgs/light/thought-bubble.svg";
import Trash from "./svgs/regular/trash.svg";
import TriangleExclamation from "./svgs/solid/triangle-exclamation.svg";
import UserPlus from "./svgs/regular/user-plus.svg";
import WandMagicSparkles from "./svgs/regular/wand-magic-sparkles.svg";
import Xmark from "./svgs/regular/xmark.svg";

import { styles } from "./icon.recipe";
import type { FormInputSize } from "../../util/form-shared";

const IconMap = {
  angleDown: AngleDown,
  angleRight: AngleRight,
  arrowDown: ArrowDown,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowUp: ArrowUp,
  arrowUpRight: ArrowUpRight,
  asterisk: Asterisk,
  at: At,
  barcode: Barcode,
  bell: Bell,
  bracketsCurly: BracketsCurly,
  bracketsSquare: BracketsSquare,
  bug: Bug,
  bullseye: Bullseye,
  calendar: Calendar,
  calendarClock: CalendarClock,
  caretDown: CaretDown,
  check: Check,
  circle: Circle,
  circleCheck: CircleCheck,
  circleEllipsis: CircleEllipsis,
  circleNodes: CircleNodes,
  circleOne: CircleOne,
  circlePlus: CirclePlus,
  clock: Clock,
  close: Xmark,
  code: Code,
  collapse: ArrowDownLeftAndArrowUpRightToCenter,
  copy: Copy,
  cube: Cube,
  cubes: Cubes,
  dash: Minus,
  diagramNested: DiagramNested,
  diagramProject: DiagramProject,
  diagramSubtask: DiagramSubtask,
  download: Download,
  edit: PenToSquare,
  emptySet: EmptySet,
  error: CircleExclamation,
  expand: ArrowUpRightAndArrowDownLeftFromCenter,
  externalLink: ArrowUpRightFromSquare,
  eye: Eye,
  eyeSlash: EyeSlash,
  feather: Feather,
  file: File,
  fileSpreadsheet: FileSpreadsheet,
  image: Image,
  infinity: InfinityLoop,
  info: CircleInfo,
  inputPipe: InputPipe,
  lightbulbOn: LightbulbOn,
  list: List,
  listTree: ListTree,
  magic: WandMagicSparkles,
  memoCircleCheck: MemoCircleCheck,
  microscope: Microscope,
  oneHundred: OneHundred,
  pen: Pen,
  personRunning: PersonRunning,
  play: Play,
  plug: Plug,
  plus: Plus,
  refresh: ArrowsRotate,
  rotate: Rotate,
  ruler: Ruler,
  search: MagnifyingGlass,
  shapes: Shapes,
  sidebar: Sidebar,
  skipForward: ForwardStep,
  sortUp: ArrowUpWideShort,
  sparkles: Sparkles,
  squareCheck: SquareCheck,
  star: Star,
  stop: Stop,
  table: Table,
  terminal: Terminal,
  text: Text,
  thoughtBubble: ThoughtBubble,
  trash: Trash,
  undo: ArrowRotateLeft,
  userPlus: UserPlus,
  warning: TriangleExclamation,
  zoomIn: MagnifyingGlassPlus,
  zoomOut: MagnifyingGlassMinus,
};

export type IconName = keyof typeof IconMap;
export const iconNames = Object.keys(IconMap) as Array<keyof typeof IconMap>;

export const Icon = ({
  className,
  name,
  size,
  alt,
}: {
  className?: string;
  name: IconName;
  size?: FormInputSize;
  alt?: string;
}) => {
  const IconSvg = IconMap[name];

  return (
    <IconSvg
      className={cx(styles({ size }), className)}
      aria-label={alt}
      role={alt ? "img" : undefined}
      aria-hidden={alt ? undefined : "true"}
    />
  );
};

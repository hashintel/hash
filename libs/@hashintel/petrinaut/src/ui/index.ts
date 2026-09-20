/**
 * Public surface for `@hashintel/petrinaut/ui` — the opinionated visual editor.
 *
 * `<Petrinaut>` is the single editor entry: it takes a
 * `PetrinautDocHandle` and renders the full editor on top of
 * `<PetrinautProvider>` (`/react`).
 *
 * @layerRoot ui
 * @role The visual editor: canvas, panels, dialogs and the Monaco integration
 */

export { KeyboardShortcut } from "./keyboard-shortcut";
export { Petrinaut } from "./petrinaut";
export {
  ExperimentExecutionCard,
  type ExperimentExecutionCardProps,
} from "./views/Editor/panels/ai-assistant-panel/ai-assistant-contents/experiment-execution-card";
export {
  Petricon,
  PetriconProvider,
  petriconNames,
  petriconPack,
  petriconEffects,
  getPetriconEffects,
  petriconCatalog,
  petriconStudies,
  usePetriconMotionAllowed,
} from "./petricon";
export type {
  PetriconName,
  PetriconProps,
  PetriconDefaults,
  PetriconStatus,
  PetriconEffect,
  PetriconMotion,
  PetriconChoreography,
  PetriconBadgeVisibility,
  PetriconTransition,
  PetriconVariant,
} from "./petricon";
export {
  ExperimentalIcon,
  ExperimentalIconProvider,
  DiagnosticsIcon,
  LoadingIcon,
  ArrowTrendDownIcon,
  ArrowTrendUpIcon,
  AsteriskIcon,
  AtIcon,
  BarcodeIcon,
  BellIcon,
  BracketsSquareIcon,
  BugIcon,
  CalendarIcon,
  CalendarClockIcon,
  CircleOneIcon,
  CubesIcon,
  DiagramNodesIcon,
  DiagramSubtaskIcon,
  DiamondExclamationIcon,
  EmptySetIcon,
  FeatherIcon,
  FileSpreadsheetIcon,
  GripVerticalIcon,
  ImageIcon,
  InputPipeIcon,
  LightbulbOnIcon,
  ListTreeIcon,
  MagicIcon,
  MemoCircleCheckIcon,
  MicroscopeIcon,
  OneHundredIcon,
  PersonRunningIcon,
  PlugIcon,
  PrintIcon,
  PuzzlePieceIcon,
  RulerIcon,
  SortDownIcon,
  SortDownAZIcon,
  SortUpIcon,
  SortUpAZIcon,
  SquareCheckIcon,
  StarIcon,
  ThoughtBubbleIcon,
  TruckIcon,
  UserPlusIcon,
  experimentalIconNames,
  experimentalIconEffects,
  getExperimentalIconEffects,
  experimentalIconPack,
  InfinityIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  ArrowsLeftRightIcon,
  TrashIcon,
  PencilIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EllipsisIcon,
  EllipsisVerticalIcon,
  CircleEllipsisIcon,
  CollapseIcon,
  LockOpenIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  ClockIcon,
  ClockRotateLeftIcon,
  RotateIcon,
  RightToLineIcon,
  FlaskIcon,
  LayerIcon,
  ChartBarSimpleIcon,
  ChartLineIcon,
  FilterIcon,
  BracketsCurlyIcon,
  LambdaIcon,
  LightningIcon,
  CodeIcon,
  CubeIcon,
  DiagramNestedIcon,
  DiagramProjectIcon,
  ShapesIcon,
  FileIcon,
  FileLinesIcon,
  ListIcon,
  TableIcon,
  GridIcon,
  BullseyeIcon,
  ScribbleIcon,
  SparklesIcon,
  InfoIcon,
  ErrorIcon,
  WarningIcon,
  CircleCheckIcon,
  TerminalIcon,
  TextIcon,
  UserIcon,
  VoiceIcon,
  TranscriptionIcon,
  AssistantIcon,
  MicrophoneIcon,
  PlaybackIcon,
  SidebarIcon,
  MenuIcon,
  HandIcon,
  CursorIcon,
  AddPlaceIcon,
  AddTransitionIcon,
  SettingsIcon,
  PlaceIcon,
  TransitionIcon,
  TokenTypeIcon,
  ParameterIcon,
  FunctionIcon,
  PlayIcon,
  PauseIcon,
  StepForwardIcon,
  StopIcon,
  ResetIcon,
  PlusIcon,
  MinusIcon,
  CloseIcon,
  CheckIcon,
  SearchIcon,
  ZoomInIcon,
  ZoomOutIcon,
  FitViewIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "./experimental-icons";
export type {
  ExperimentalIconName,
  ExperimentalIconStatus,
  ExperimentalIconProps,
  ExperimentalIconComponentProps,
  ExperimentalIconDefaults,
  ExperimentalIconVariant,
  ExperimentalIconBadgeVisibility,
  ExperimentalIconEffect,
  ExperimentalIconMotion,
  ExperimentalIconTransition,
  ExperimentalIconChoreography,
} from "./experimental-icons";
export {
  // The user-guide pages the built-in documentation read serves, so a host
  // tool under its own name can answer with the same text.
  petrinautDocsContent,
  type PetrinautAiMessage,
  type PetrinautAiMessageMetadata,
} from "./views/Editor/panels/ai-assistant-panel";
export type {
  PetrinautAiAssistant,
  PetrinautAiChatTransport,
  PetrinautAiStopResult,
  PetrinautAiToolPresentation,
  PetrinautAiToolPresentationContext,
  PetrinautAiToolPresentationResolver,
  PetrinautAiToolPresentationState,
  PetrinautAiToolPresentationTone,
  PetrinautProps,
} from "./petrinaut";
export type {
  PetrinautAiComposerControl,
  PetrinautAiComposerControlContext,
  PetrinautAiComposerStatus,
  PetrinautAiComposerSubmitTextResult,
  PetrinautAiInputMode,
  PetrinautAiVoiceMode,
  PetrinautAiVoiceModeContext,
  PetrinautAiVoiceModeControls,
  PetrinautAiVoiceModeSessionControls,
  PetrinautAiVoiceSessionPhase,
  PetrinautAiVoiceSessionState,
} from "./types/ai-assistant-composer-control";
export type {
  PetrinautNavigationAction,
  PetrinautNavigationController,
  PetrinautNavigationHistory,
  PetrinautNavigationHistoryPolicy,
  PetrinautNavigationIntent,
  PetrinautNavigationOverlay,
  PetrinautNavigationState,
  PetrinautNavigationUpdate,
  PetrinautNavigationUpdater,
  PetrinautSimulateResource,
} from "../react/navigation";
export type {
  PetrinautAiAutomaticTool,
  PetrinautAiAutomaticToolExecuteParams,
  PetrinautAiViewportFrameResult,
} from "./types/ai-automatic-tool";
export { definePetrinautAiInteractiveTool } from "./types/ai-interactive-tool";
export type {
  PetrinautAiInteractiveTool,
  PetrinautAiInteractiveToolDefinition,
  PetrinautAiInteractiveToolSchema,
  PetrinautAiInteractiveToolWidgetProps,
} from "./types/ai-interactive-tool";
export { DefaultChatTransport } from "ai";

// SDCPN value-equality check exposed for consumers that need to detect
// no-op changes outside the handle (e.g. memoising Storybook stories).
export { isSDCPNEqual } from "@hashintel/petrinaut-core";

// Plugins — how a host adds buttons, commands, panel sections and edit views
// to the editor. `<PetrinautPluginsProvider>` above `<Petrinaut>` installs them.
export { petrinautBuiltInPlugins } from "./plugins/built-in-plugins";
export { definePetrinautPlugin } from "./plugins/plugin";
export type {
  PetrinautPlugin,
  PetrinautPluginButton,
  PetrinautPluginButtonPlacement,
  PetrinautPluginEditView,
  PetrinautPluginSubView,
  PetrinautPluginSubViewPlacement,
  PetrinautPluginTopBarItem,
  PetrinautPluginTopBarPlacement,
} from "./plugins/plugin";
export { PetrinautPluginsProvider } from "./plugins/plugins-provider";
export type { PetrinautPluginsProviderProps } from "./plugins/plugins-provider";
export type { SubView, SubViewResizeConfig } from "./components/sub-view/types";
// Superseded by plugin buttons and top-bar items; removed once every host has moved.
export type { ViewportAction } from "./types/viewport-action";
export type { PetrinautSlots } from "./types/petrinaut-slots";

// Walkthrough — first-visit product tour. Exposed so embedders can drive it
// programmatically (e.g. trigger from their own help menu) without relying on
// the built-in TopBar button.
export {
  WalkthroughContext,
  WalkthroughProvider,
  WalkthroughDialog,
} from "./components/walkthrough";
export type {
  WalkthroughContextValue,
  WalkthroughStep,
} from "./components/walkthrough";

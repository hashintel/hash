import type { HashIconName } from "../hash-icon";

export const descriptions = {
  calendarWeek: "A calendar with highlighted rows represents a week.",
  calendarDay: "A calendar with one marked day represents a specific date.",
  handwrittenDocs:
    "A document and pen represent handwritten notes or authored documentation.",
  newspaper:
    "A page of columns and headlines represents news or a publication.",
  books:
    "Several bound volumes represent a library or collection of references.",
  bookOpen: "An open book represents reading, learning, or documentation.",
  book: "A bound volume represents a book or reference material.",
  archive: "A lidded storage box represents archived material.",
  clipboardList:
    "A clipboard with entries represents a checklist or recorded tasks.",
  clipboardCheck:
    "A clipboard with a check represents a completed task or verified record.",
  clipboard: "A clipboard represents recorded or copied information.",
  memoInfo:
    "A note with an information mark represents contextual documentation.",
  notePlus: "A note with a plus represents adding a new note.",
  noteSticky: "A page with a folded corner represents a sticky note.",
  folder: "A folder represents a collection of files or resources.",
  files: "Overlapping documents represent a collection of files.",
  fileExport: "An arrow leaving a document represents exporting a file.",
  fileEdit: "A document and pencil represent editing a file.",
  filePlus: "A document with a plus represents creating or adding a file.",
  fileInvoiceDollar:
    "An invoice with a currency symbol represents a bill or payment request.",
  fileBox: "A document with a package represents a bundled file.",
  fileImage: "A document with a landscape represents an image file.",
  fileVideo: "A document with a play symbol represents a video file.",
  fileAudio: "A document with a musical note represents an audio file.",
  filePdf: "A document with a compact page mark represents a PDF file.",
  filePresentation: "A document with a P represents a presentation file.",
  fileContract: "A signed document represents a contract or agreement.",
  fileInvoice: "A document with itemized lines represents an invoice.",
  fileText: "A document with a T represents a plain text file.",
  fileDocument: "A document with a W represents a word-processing document.",
  fileCode: "A document with angle brackets represents a source code file.",
  fileArchive: "A document with a zipper represents a compressed archive.",
  mcpServer:
    "The official Model Context Protocol mark represents an MCP server or connection.",
  differentialEquation:
    "A derivative written as d/dt represents rates of change.",
  equationCurve:
    "A curve with a sample point represents the solution of an equation.",
  equationFlow:
    "A path through a slope field represents how a system changes over time.",
  parameter: "Two sliders represent adjustable model inputs.",
  parameterDial: "A calibration dial represents an adjustable parameter.",
  parameterRange:
    "Paired markers represent a parameter's lower and upper bounds.",
  variable: "A curved x represents a changing value.",
  variableBrackets:
    "An x inside square brackets represents a bound expression.",
  variableRegister:
    "A value and a cursor inside a frame represent a variable stored in a register.",
  tokenType: "Three circular tokens represent a token family.",
  tokenTypeStack: "Stacked tokens represent a typed collection.",
  tokenTypeTag: "A tag containing a circular token represents a type label.",
  cube: "A cube represents a spatial module or encapsulated model.",
  subnetNetwork:
    "Two places connected to a transition inside a boundary represent a Petri net subnet.",
  subnetLayers: "Overlapping module frames represent nested subnets.",
  sum: "A summation symbol represents adding a sequence of terms.",
  sumRange:
    "A summation symbol with limits represents adding terms over a specified range.",
  integral:
    "An integral sign represents accumulation over a continuous domain.",
  integralBounds:
    "An integral sign with limits represents accumulation over a specified interval.",
  matrix: "Individual values inside square brackets represent a matrix.",
  matrixGrid:
    "Rows of values inside square brackets represent a matrix organized by row.",
  probability: "A bell-shaped curve represents a probability distribution.",
  probabilityDice: "A die showing five pips represents a discrete outcome.",
  expression: "An x between angle brackets represents an inline expression.",
  expressionTree:
    "A circular root connected to two rectangular children represents a syntax tree.",
  typeVariable: "A T with a smaller x represents a type variable.",
  typeUnion:
    "A circle and a rectangle separated by a vertical bar represents a choice of types.",
  breakpoint:
    "An octagonal stop marker with a central dot represents an execution breakpoint.",
  breakpointLine:
    "A stop marker beside code represents a breakpoint on a particular line.",
  testTube:
    "A tilted test tube represents an experiment or a test without a result.",
  testTubeCheck:
    "A tilted test tube with a checkmark represents a successful test.",
  testTubeCross: "A tilted test tube with a cross represents a failed test.",
  testCheck: "A clipboard with a checkmark represents a validation result.",
  agent: "A robot face represents an agent.",
  agentOrbit:
    "A central circle surrounded by orbiting nodes represents an autonomous process.",
  context: "Overlapping documents represent supporting context.",
  contextWindow: "Text rows inside open brackets represent a context window.",
  reasoning: "Three connected steps represent a reasoning sequence.",
  reasoningFork: "A branching path represents alternative lines of reasoning.",
  embedding: "Points on coordinate axes represent an embedding space.",
  embeddingVector:
    "An arrow on coordinate axes represents a vector in an embedding space.",

  infinity:
    "A continuous figure-eight loop represents an unlimited value or repeated process.",
  arrowUp: "An upward arrow represents moving up or increasing a value.",
  arrowDown: "A downward arrow represents moving down or decreasing a value.",
  arrowLeft: "A left-pointing arrow represents moving back or left.",
  arrowRight: "A right-pointing arrow represents moving forward or right.",
  arrowUpRight:
    "A diagonal arrow represents opening a destination or moving outward.",
  arrowsLeftRight:
    "Two opposed horizontal arrows represent exchange or movement in both directions.",
  trash: "A wastebasket represents deleting an item.",
  pencil: "A pencil represents editing or drawing.",
  copy: "Two overlapping sheets represent copying an item.",
  download: "An arrow entering a tray represents downloading a file.",
  link: "Two joined chain links represent a hyperlink or section anchor.",
  linkBroken:
    "Two separated chain ends represent a broken link or disconnected relationship.",
  externalLink:
    "An arrow leaving a square represents opening an external destination.",
  ellipsis: "Three horizontal dots represent additional actions.",
  ellipsisVertical:
    "Three vertical dots represent additional actions in a narrow space.",
  circleEllipsis:
    "Three dots inside a circle represent a more-actions control.",
  collapse: "Four inward-pointing arrows represent reducing an expanded view.",
  lockOpen: "An open padlock represents an unlocked or editable state.",
  lockClosed: "A closed padlock represents a locked or restricted state.",
  eye: "An open eye represents showing content or inspecting visibility.",
  eyeSlash:
    "A crossed-out eye represents hidden content or disabled visibility.",
  clock: "A clock face represents time or duration.",
  clockRotateLeft:
    "A clock inside a backward circular arrow represents history or a previous state.",
  rotate:
    "Two curved arrows represent rotating an object or refreshing a cycle.",
  rightToLine:
    "A right-pointing arrow meeting a vertical line represents moving to an endpoint.",
  flask: "A flask containing liquid represents an experiment or simulation.",
  layer: "Three stacked planes represent layers or levels.",
  chartBarSimple: "Three vertical bars on axes represent comparing quantities.",
  chartLine: "A connected line on axes represents a trend or time series.",
  filter: "A funnel represents narrowing a set of results.",
  bracketsCurly: "A pair of curly braces represents an object or code block.",
  lambda:
    "The Greek letter lambda represents a function or mathematical parameter.",
  lightning: "A lightning bolt represents a fast action, event, or energy.",
  code: "Angle brackets with a slash represent source code.",
  diagramNested:
    "A divided inner frame inside a larger frame represents nested structure.",
  diagramProject:
    "Three connected rectangular nodes represent a project or dependency diagram.",
  shapes: "A triangle, circle, square, and diamond represent shape tools.",
  file: "A sheet with a folded corner represents a file.",
  fileLines:
    "A folded-corner sheet with text lines represents a text document.",
  list: "Three bulleted rows represent a list view.",
  table:
    "A rectangular grid with rows and a leading column represents tabular data.",
  grid: "Four separate squares represent a grid view.",
  bullseye:
    "Concentric circles around a center point represent a target or goal.",
  scribble:
    "A loose curved path ending in an arrow represents a freeform route or gesture.",
  sparkles:
    "A large sparkle with a smaller companion represents an enhancement or generated result.",
  info: "An information mark inside a circle represents supporting information.",
  error: "An exclamation mark inside a circle represents an error state.",
  warning: "An exclamation mark inside a triangle represents a warning.",
  circleCheck:
    "A checkmark inside a circle represents a successful or completed state.",
  circleClose:
    "A cross inside a circle represents dismissal, cancellation, or a failed state.",
  terminal:
    "A command prompt and cursor inside a window represents a terminal.",
  text: "A capital T beside a smaller t represents text or typography.",
  user: "A person's head and shoulders represents an account or person.",
  voice: "Five vertical waveform bars represent voice or audio.",
  transcription: "Three horizontal text lines represent a speech transcript.",
  assistant: "Four diamonds arranged around a center represent an assistant.",
  arrowTrendUp: "A rising zigzag arrow represents an upward trend.",
  arrowTrendDown: "A falling zigzag arrow represents a downward trend.",
  asterisk: "A six-spoked asterisk represents a wildcard or annotation.",
  at: "An at sign represents a mention or address.",
  barcode:
    "Six vertical bars of varying spacing represent a barcode or identifier.",
  bell: "A bell represents notifications or alerts.",
  bracketsSquare:
    "A pair of square brackets represents an array or bounded expression.",
  bug: "A beetle-like bug represents a defect or debugging.",
  calendar: "A calendar with one marked day represents a date.",
  calendarClock: "A calendar with a clock represents a scheduled time.",
  circleOne:
    "The numeral one inside a circle represents a first step or single item.",
  cubes: "Three connected cubes represent a collection of modules or objects.",
  diagramNodes:
    "Four circular nodes joined diagonally represent a graph or network.",
  diagramSubtask:
    "Two rectangular tasks branching from a shared stem represent subtasks.",
  diamondExclamation:
    "An exclamation mark inside a diamond represents an alert or exception.",
  emptySet: "A slashed circle represents the mathematical empty set.",
  feather:
    "A feather with a central quill represents writing or lightweight editing.",
  fileSpreadsheet:
    "A folded-corner sheet containing a table represents a spreadsheet file.",
  gripVertical: "Two columns of three dots represent a drag handle.",
  image: "A framed landscape with a sun represents an image.",
  inputPipe:
    "A right-pointing arrow entering a bracket represents an input or incoming data.",
  lightbulbOn:
    "A lightbulb with a visible filament represents an idea or insight.",
  listTree:
    "Two list entries branching from a vertical stem represent a hierarchy.",
  magic:
    "A wand surrounded by small sparks represents an assisted or automated action.",
  memoCircleCheck:
    "A note with a circled checkmark represents a reviewed or completed document.",
  microscope:
    "A microscope represents examining details or investigating a result.",
  oneHundred: "An underlined 100 represents a complete score or percentage.",
  personRunning: "A running person represents activity or execution.",
  plug: "An electrical plug represents a connection or integration.",
  print: "A printer with an emerging sheet represents printing.",
  puzzlePiece: "A puzzle piece represents an extension or compatible part.",
  ruler:
    "A diagonal ruler with measurement marks represents dimensions or spacing.",
  logicAnd: "A conjunction symbol represents conditions that must all hold.",
  logicOr:
    "A disjunction symbol represents a choice where at least one condition holds.",
  logicNot:
    "A negation symbol represents the opposite truth value of a condition.",
  logicImplies: "A double arrow represents one condition implying another.",
  logicEquivalent:
    "A bidirectional double arrow represents logical equivalence.",
  logicForAll:
    "A universal quantifier represents a condition holding for every member.",
  logicExists:
    "An existential quantifier represents at least one member satisfying a condition.",
  logicNext: "An arrow between states highlights the next state in a sequence.",
  logicUntil:
    "A line ending at an event represents a condition persisting until that event occurs.",
  logicBranching:
    "A state with two outgoing paths represents alternative possible futures.",
  logicInvariant:
    "A bar above successive states represents a condition that holds throughout an execution.",
  logicCounterexample:
    "A trace ending in a cross represents an execution that violates a property.",
  logicConstraint:
    "A bracketed inequality represents a restriction on permitted values.",
  logicRobustness:
    "A marked gap between a signal and a threshold represents the margin by which a condition holds.",
  logicSignalBounded:
    "A waveform with a marked interval represents signal temporal logic over a bounded period.",
  logicSignalThreshold:
    "A waveform crossing a threshold represents a predicate on a signal value in signal temporal logic.",
  logicSignalClock:
    "A waveform beside a clock represents time-based signal conditions in signal temporal logic.",
  logicStateSequence:
    "Connected states represent a linear execution path evaluated by linear temporal logic.",
  logicTemporalOperators:
    "Square and diamond operators above a timeline represent always and eventually in temporal logic.",
  logicBooleanTrace:
    "A stepped trace represents Boolean values over time for evaluation with linear temporal logic.",
  sortDown:
    "A downward arrow beside shortening rows represents descending size or value order.",
  sortUp:
    "An upward arrow beside lengthening rows represents ascending size or value order.",
  sortDownBoolean:
    "A downward arrow beside a cross above a tick represents boolean order with false values first.",
  sortUpBoolean:
    "An upward arrow beside a tick above a cross represents boolean order with true values first.",
  sortDownDate:
    "A calendar beside a downward arrow represents sorting dates from oldest to newest.",
  sortUpDate:
    "A calendar beside an upward arrow represents sorting dates from newest to oldest.",
  sortDownDuration:
    "A clock beside a downward arrow represents sorting durations from shortest to longest.",
  sortUpDuration:
    "A clock beside an upward arrow represents sorting durations from longest to shortest.",
  sortDownPriority:
    "An exclamation mark above a minus sign represents sorting high-priority items first.",
  sortUpPriority:
    "A minus sign above an exclamation mark represents sorting low-priority items first.",
  sortDownEmptyValues:
    "A hollow circle above a solid circle represents placing missing values before populated values.",
  sortUpEmptyValues:
    "A solid circle above a hollow circle represents placing populated values before missing values.",
  sortDownNumeric:
    "A downward arrow beside 1 and 9 represents numeric order from low to high.",
  sortUpNumeric:
    "An upward arrow beside 9 and 1 represents numeric order from high to low.",
  sortDownAlphabetical:
    "A downward arrow beside A and Z represents alphabetical order from A to Z.",
  sortUpAlphabetical:
    "An upward arrow beside Z and A represents alphabetical order from Z to A.",
  sortDownShapes:
    "A downward arrow beside a circle above a triangle represents sorting by shape or object type.",
  sortUpShapes:
    "An upward arrow beside a triangle above a circle represents reversing shape or object-type order.",
  sortDownSize:
    "A downward arrow beside four progressively shorter lines represents sorting from largest to smallest.",
  sortUpSize:
    "An upward arrow beside four progressively longer lines represents sorting from smallest to largest.",
  squareCheck:
    "A checkmark inside a square represents a checked item or selection.",
  star: "A five-pointed star represents a favorite or rating.",
  thoughtBubble:
    "A cloud-shaped thought bubble with trailing dots represents a thought or idea.",
  truck: "A delivery truck represents transport or shipment.",
  userPlus: "A person with a plus sign represents adding or inviting someone.",
  sidebar: "A window with a left panel represents showing or hiding a sidebar.",
  menu: "Three horizontal lines represent a menu.",
  microphone: "A microphone represents audio input.",
  playback:
    "A control that switches between play and pause represents playback state.",
  diagnostics:
    "A checkmark, exclamation mark, or cross represents a successful, warning, or error diagnostic result.",
  loading: "A partial ring represents an operation in progress.",
  hand: "An open hand represents panning or dragging a canvas.",
  cursor: "A pointer arrow represents selecting objects.",
  place: "A circle represents a Petri-net place that can hold tokens.",
  transition:
    "A rounded square represents a Petri-net transition that consumes and produces tokens.",
  addPlace:
    "A circular place with a plus badge represents adding a Petri-net place.",
  addTransition:
    "A rounded-square transition with a plus badge represents adding a Petri-net transition.",
  settings: "A gear represents settings or configuration.",
  function:
    "A mathematical function symbol represents a function or transformation.",
  play: "A right-pointing triangle represents starting or resuming playback.",
  pause: "Two vertical bars represent pausing playback.",
  stepForward:
    "A play triangle facing an endpoint represents advancing one step.",
  stop: "A rounded square represents stopping playback or execution.",
  reset: "A backward circular arrow represents returning to an initial state.",
  plus: "A plus sign represents adding an item or increasing a value.",
  minus: "A minus sign represents removing an item or decreasing a value.",
  close: "A diagonal cross represents closing or dismissing a view.",
  check: "A checkmark represents confirming an action or marking completion.",
  search: "A magnifying glass represents finding content.",
  zoomIn:
    "A magnifying glass with a plus sign represents increasing magnification.",
  zoomOut:
    "A magnifying glass with a minus sign represents decreasing magnification.",
  fitView: "Four open corners represent fitting content into a viewport.",
  chevronUp:
    "An upward chevron represents expanding upward or moving to a previous item.",
  chevronDown:
    "A downward chevron represents expanding downward or moving to a next item.",
  chevronLeft:
    "A left-pointing chevron represents moving backward through items.",
  chevronRight:
    "A right-pointing chevron represents moving forward through items.",
} satisfies Record<HashIconName, string>;

import type { HashIconName } from "../hash-icon";

export const descriptions = {
  differentialEquation:
    "A derivative written as d/dt for rates of change. On hover, the numerator and denominator move apart around the fraction bar.",
  equationCurve:
    "A solution curve on coordinate axes with a sample point. On hover, the curve changes shape and the sample point moves up and to the right.",
  equationFlow:
    "A solution path through a slope field. On hover, the path changes shape and the surrounding field tilts.",
  parameter:
    "Two sliders for adjustable model inputs. On hover, their knobs slide in opposite directions, then return.",
  parameterDial:
    "A calibration dial for an adjustable parameter. On hover, the needle turns around its pivot while the scale stays fixed.",
  parameterRange:
    "Paired markers for a parameter's lower and upper bounds. On hover, the bounds move inward and the value marker between them widens.",
  variable:
    "A curved x for a changing value. On hover, its two strokes skew in opposite directions, then settle back.",
  variableBrackets:
    "An x inside square brackets for a bound expression. On hover, the brackets open outward while the value lifts and contracts slightly.",
  variableRegister:
    "An x and a cursor inside a value register. On hover, the value lifts and contracts, and the cursor shortens inside the fixed frame.",
  tokenType:
    "Three circular tokens for a token family. On hover, the upper token lowers slightly and the two lower tokens shift outward and upward.",
  tokenTypeStack:
    "Stacked tokens for a typed collection. On hover, the upper layers lift apart while the bottom layer stays fixed.",
  tokenTypeTag:
    "A tag containing a circular token for a type label. On hover, the token contracts inside the fixed tag outline.",
  cube: "A cube for a spatial module or encapsulated model. It turns in depth on hover, hiding rear edges; the action animation makes a quarter-turn.",
  subnetNetwork:
    "Two places connected to a transition inside a subnet boundary. On hover, the connections draw in and the place nodes lift slightly.",
  subnetLayers:
    "Overlapping module frames for nested subnets. On hover, the front module shifts down and left while the back frame stays fixed.",
  sum: "A summation operator without bounds. On hover, the sigma makes a small sideways writing gesture.",
  sumRange:
    "A summation operator with upper and lower bounds. On hover, the sigma shifts slightly and the bounds spread vertically.",
  integral:
    "An integral sign without bounds. On hover, the curve makes a small sideways writing gesture.",
  integralBounds:
    "An integral sign with upper and lower limits. On hover, the curve shifts slightly and the limit marks spread vertically.",
  matrix:
    "Four individual values inside matrix brackets. On hover, the values contract together while the brackets stay fixed.",
  matrixGrid:
    "Three rows of values inside matrix brackets. On hover, the rows shift slightly to the right within the fixed brackets.",
  probability:
    "A bell-shaped distribution above a baseline. On hover, the distribution leans sideways while the baseline stays fixed.",
  probabilityDice:
    "A die showing five pips for a discrete outcome. On hover, the pips contract toward the center within the fixed die outline.",
  expression:
    "An x between angle brackets for an inline expression. On hover, the brackets open outward and the x shifts slightly.",
  expressionTree:
    "A circular root connected to two rectangular children for a syntax tree. On hover, the root contracts while the children and connections stay fixed.",
  typeVariable:
    "A T with a smaller x for a type variable. On hover, the T shifts slightly sideways and the x lifts.",
  typeUnion:
    "A circle and a rectangle separated by a vertical bar for a choice of types. On hover, the two shapes move apart around the fixed separator.",
  breakpoint:
    "An octagonal stop marker with a central dot for an execution breakpoint. On hover, the dot contracts within the fixed outline.",
  breakpointLine:
    "A breakpoint marker beside lines of code. On hover, the marker contracts and the marked line shifts slightly to the right.",
  testTube:
    "A tilted test tube with a checkmark for an experiment or test. On hover, its liquid level shifts sideways and the checkmark pulses briefly.",
  testCheck:
    "A clipboard with a checkmark for a validation result. On hover, the checkmark grows briefly inside the fixed clipboard.",
  agent:
    "A robot face for an agent. On hover, its eyes blink and its antenna turns slightly while the head stays fixed.",
  agentOrbit:
    "A central circle surrounded by orbiting nodes for an autonomous process. On hover, the outer orbit turns while the center stays fixed.",
  context:
    "Overlapping documents for supporting context. On hover, the rear page shifts down and right, and the text lines shift slightly.",
  contextWindow:
    "Text rows inside open brackets for a context window. On hover, the brackets spread outward and the rows shift to the right.",
  reasoning:
    "Three connected steps for a reasoning sequence. On hover, the middle node contracts and the connecting path shifts slightly.",
  reasoningFork:
    "A shared step branching to two alternatives. On hover, the right branch node contracts and the connecting path shifts slightly.",
  embedding:
    "Points on coordinate axes for an embedding space. On hover, the points contract toward the center while the axes stay fixed.",
  embeddingVector:
    "A diagonal vector on coordinate axes. On hover, the arrow moves up and right and the reference marks shift slightly.",

  infinity:
    "A continuous figure-eight loop for an unlimited value or repeated process. It grows slightly on hover.",
  arrowUp:
    "An upward arrow for moving up or increasing a value. It shifts upward on hover.",
  arrowDown:
    "A downward arrow for moving down or decreasing a value. It shifts downward on hover.",
  arrowLeft:
    "A left-pointing arrow for moving back or left. It shifts left on hover.",
  arrowRight:
    "A right-pointing arrow for moving forward or right. It shifts right on hover.",
  arrowUpRight:
    "A diagonal arrow for opening a destination or moving outward. It shifts up and right on hover.",
  arrowsLeftRight:
    "Two opposed horizontal arrows for exchange or movement in both directions. They grow slightly together on hover.",
  trash:
    "A wastebasket for deleting an item. Its lid lifts and tilts on hover.",
  pencil: "A pencil for editing or drawing. It tilts slightly on hover.",
  copy: "Two overlapping sheets for copying an item. The front sheet shifts down and right on hover.",
  download:
    "An arrow entering a tray for downloading a file. The arrow moves downward on hover.",
  externalLink:
    "An arrow leaving a square for opening an external destination. The arrow shifts up and right on hover.",
  ellipsis:
    "Three horizontal dots for additional actions. The middle dot grows slightly on hover.",
  ellipsisVertical:
    "Three vertical dots for additional actions in a narrow space. The middle dot grows slightly on hover.",
  circleEllipsis:
    "Three dots inside a circle for a more-actions control. The circle and dots lift briefly in sequence on hover.",
  collapse:
    "Four inward-pointing arrows for reducing an expanded view. They contract toward the center on hover.",
  lockOpen:
    "An open padlock for an unlocked or editable state. Its shackle lifts slightly on hover.",
  lockClosed:
    "A closed padlock for a locked or restricted state. Its shackle lifts slightly on hover.",
  eye: "An open eye for showing content or inspecting visibility. Its pupil grows slightly on hover.",
  eyeSlash:
    "A crossed-out eye for hidden content or disabled visibility. Its pupil grows slightly behind the slash on hover.",
  clock:
    "A clock face for time or duration. Its hands turn slightly backward on hover.",
  clockRotateLeft:
    "A clock inside a backward circular arrow for history or a previous state. The surrounding arrow and clock hands rotate backward on hover.",
  rotate:
    "Two curved arrows for rotating an object or refreshing a cycle. They turn slightly clockwise on hover.",
  rightToLine:
    "A right-pointing arrow meeting a vertical line for moving to an endpoint. The arrow advances toward the line on hover.",
  flask:
    "A flask containing liquid for an experiment or simulation. Its liquid ripples on hover, and selection raises the liquid level.",
  layer:
    "Three stacked planes for layers or levels. The upper and lower planes separate slightly on hover.",
  chartBarSimple:
    "Three vertical bars on axes for comparing quantities. The bars stretch upward on hover.",
  chartLine:
    "A connected line on axes for a trend or time series. The line lifts slightly on hover.",
  filter:
    "A funnel for narrowing a set of results. It contracts slightly on hover.",
  bracketsCurly:
    "A pair of curly braces for an object or code block. The braces grow and move apart on hover.",
  lambda:
    "The Greek letter lambda for a function or mathematical parameter. It lifts slightly on hover.",
  lightning:
    "A lightning bolt for a fast action, event, or energy. It lifts slightly on hover.",
  code: "Angle brackets with a slash for source code. The brackets move apart on hover while the slash stays fixed.",
  diagramNested:
    "A divided inner frame inside a larger frame for nested structure. The frames lift briefly in sequence on hover.",
  diagramProject:
    "Three connected rectangular nodes for a project or dependency diagram. Its nodes and connections lift briefly in sequence on hover.",
  shapes:
    "A triangle, circle, square, and diamond for shape tools. On hover, the circle lifts and the other shapes turn; selection changes their arrangement.",
  file: "A sheet with a folded corner for a file. It lifts slightly on hover.",
  fileLines:
    "A folded-corner sheet with text lines for a text document. Its lines shift right on hover.",
  list: "Three bulleted rows for a list view. The row lines shift right on hover while the bullets stay fixed.",
  table:
    "A rectangular grid with rows and a leading column for tabular data. Its frame and dividers lift briefly in sequence on hover.",
  grid: "Four separate squares for a grid view. The squares lift briefly in sequence on hover.",
  bullseye:
    "Concentric circles around a center point for a target or goal. The middle ring contracts slightly on hover.",
  scribble:
    "A loose curved path ending in an arrow for a freeform route or gesture. It shifts right on hover.",
  sparkles:
    "A large sparkle with a smaller companion for an enhancement or generated result. The large sparkle grows and turns slightly on hover.",
  info: "An information mark inside a circle for supporting information. Its parts lift briefly in sequence on hover.",
  error:
    "An exclamation mark inside a circle for an error state. Its parts lift briefly in sequence on hover.",
  warning:
    "An exclamation mark inside a triangle for a warning. Its parts lift briefly in sequence on hover.",
  circleCheck:
    "A checkmark inside a circle for a successful or completed state. Its parts lift briefly in sequence on hover.",
  circleClose:
    "A cross inside a circle for dismissal, cancellation, or a failed state. Its parts lift briefly in sequence on hover.",
  terminal:
    "A command prompt and cursor inside a window for a terminal. The prompt arrow shifts right on hover.",
  text: "A capital T beside a smaller t for text or typography. The lettering lifts briefly on hover.",
  user: "A person's head and shoulders for an account or person. The head lifts slightly on hover.",
  voice:
    "Five vertical waveform bars for voice or audio. The waveform compresses vertically on hover.",
  transcription:
    "Three horizontal text lines for a speech transcript. The lines shift right on hover.",
  assistant:
    "Four diamonds arranged around a center for an assistant. The group grows and turns slightly on hover.",
  arrowTrendUp:
    "A rising zigzag arrow for an upward trend. It shifts up and right on hover.",
  arrowTrendDown:
    "A falling zigzag arrow for a downward trend. It shifts downward on hover.",
  asterisk:
    "A six-spoked asterisk for a wildcard or annotation. It turns slightly clockwise on hover.",
  at: "An at sign for a mention or address. It turns slightly clockwise on hover.",
  barcode:
    "Six vertical bars of varying spacing for a barcode or identifier. The bars pulse in height and opacity on hover.",
  bell: "A bell for notifications or alerts. The bell tilts and its clapper shifts sideways on hover.",
  bracketsSquare:
    "A pair of square brackets for an array or bounded expression. The brackets move apart on hover.",
  bug: "A beetle-like bug for a defect or debugging. Its legs and antennae turn slightly around the body on hover.",
  calendar:
    "A calendar with one marked day for a date. The day marker grows slightly on hover.",
  calendarClock:
    "A calendar with a clock for a scheduled time. The clock hands turn slightly backward on hover.",
  circleOne:
    "The numeral one inside a circle for a first step or single item. Its parts lift briefly in sequence on hover.",
  cubes:
    "Three connected cubes for a collection of modules or objects. The cluster lifts briefly on hover.",
  diagramNodes:
    "Four circular nodes joined diagonally for a graph or network. The nodes and connections lift briefly in sequence on hover.",
  diagramSubtask:
    "Two rectangular tasks branching from a shared stem for subtasks. The diagram lifts briefly on hover.",
  diamondExclamation:
    "An exclamation mark inside a diamond for an alert or exception. Its parts lift briefly in sequence on hover.",
  emptySet:
    "A slashed circle for the mathematical empty set. It turns slightly clockwise on hover.",
  feather:
    "A feather with a central quill for writing or lightweight editing. It tilts slightly on hover.",
  fileSpreadsheet:
    "A folded-corner sheet containing a table for a spreadsheet file. The document lifts briefly on hover.",
  gripVertical:
    "Two columns of three dots for a drag handle. The dots lift briefly in sequence on hover.",
  image:
    "A framed landscape with a sun for an image. The sun lifts slightly on hover.",
  inputPipe:
    "A right-pointing arrow entering a bracket for an input or incoming data. It shifts right on hover.",
  lightbulbOn:
    "A lightbulb with a visible filament for an idea or insight. The filament lifts slightly on hover.",
  listTree:
    "Two list entries branching from a vertical stem for a hierarchy. The tree lifts briefly on hover.",
  magic:
    "A wand surrounded by small sparks for an assisted or automated action. The sparks grow and turn slightly on hover.",
  memoCircleCheck:
    "A note with a circled checkmark for a reviewed or completed document. Its parts lift briefly in sequence on hover.",
  microscope:
    "A microscope for examining details or investigating a result. It tilts slightly on hover.",
  oneHundred:
    "An underlined 100 for a complete score or percentage. Its parts lift briefly in sequence on hover.",
  personRunning:
    "A running person for activity or execution. Its limbs and body complete one running cycle on hover by default; the action animation adds a jump. Continuous animation is opt-in.",
  plug: "An electrical plug for a connection or integration. Its pins shift downward on hover.",
  print:
    "A printer with an emerging sheet for printing. The lower sheet advances downward on hover.",
  puzzlePiece:
    "A puzzle piece for an extension or compatible part. It contracts slightly on hover.",
  ruler:
    "A diagonal ruler with measurement marks for dimensions or spacing. It tilts slightly on hover.",
  sortDown:
    "A downward arrow beside shortening rows for descending size or value order. It shifts downward on hover.",
  sortUp:
    "An upward arrow beside lengthening rows for ascending size or value order. It shifts upward on hover.",
  sortDownNumeric:
    "A downward arrow beside 1 and 9 for numeric order from low to high. It shifts downward on hover.",
  sortUpNumeric:
    "An upward arrow beside 9 and 1 for numeric order from high to low. It shifts upward on hover.",
  sortDownAlphabetical:
    "A downward arrow beside A and Z for alphabetical order from A to Z. It shifts downward on hover.",
  sortUpAlphabetical:
    "An upward arrow beside Z and A for alphabetical order from Z to A. It shifts upward on hover.",
  sortDownShapes:
    "A downward arrow beside a circle above a pyramid for sorting by shape or object type. It shifts downward on hover.",
  sortUpShapes:
    "An upward arrow beside a pyramid above a circle for reversing shape or object-type order. It shifts upward on hover.",
  sortDownSize:
    "A downward arrow beside four progressively shorter lines for sorting from largest to smallest. It shifts downward on hover.",
  sortUpSize:
    "An upward arrow beside four progressively longer lines for sorting from smallest to largest. It shifts upward on hover.",
  squareCheck:
    "A checkmark inside a square for a checked item or selection. Its parts lift briefly in sequence on hover.",
  star: "A five-pointed star for a favorite or rating. It tilts slightly on hover.",
  thoughtBubble:
    "A cloud-shaped thought bubble with trailing dots for a thought or idea. The larger trailing dot grows slightly on hover.",
  truck:
    "A delivery truck for transport or shipment. It shifts right on hover.",
  userPlus:
    "A person with a plus sign for adding or inviting someone. The head lifts slightly on hover.",
  sidebar:
    "A window with a left panel for showing or hiding a sidebar. Hover nudges its divider; the collapsed state retracts the panel.",
  menu: "Three horizontal lines for a menu. They contract slightly on hover and transform into a cross when the menu is open.",
  microphone:
    "A microphone for audio input. It lifts slightly on hover, and the muted state adds a diagonal slash.",
  playback:
    "A combined play and pause control for playback. It grows slightly on hover and changes from a triangle to pause bars when playing.",
  diagnostics:
    "A state-dependent mark for validation or diagnostics. Its strokes transform between a checkmark, exclamation mark, and cross as status changes.",
  loading:
    "A partial ring over a faint circle for a loading state. It turns slightly on hover; the LoadingIcon component enables a continuous spin by default.",
  hand: "An open hand for panning or dragging a canvas. It lifts slightly on hover.",
  cursor: "A pointer arrow for selecting objects. It tilts slightly on hover.",
  place:
    "A circle for a Petri-net place that can hold tokens. It grows slightly on hover.",
  transition:
    "A rounded square for a Petri-net transition that consumes and produces tokens. It grows slightly on hover.",
  addPlace:
    "A circular place with a plus badge for adding a Petri-net place. The badge appears on hover by default, and selection enlarges the place slightly.",
  addTransition:
    "A rounded-square transition with a plus badge for adding a Petri-net transition. The badge appears on hover by default, and selection enlarges the transition slightly.",
  settings:
    "A gear for settings or configuration. It turns when its open state changes.",
  function:
    "A mathematical function symbol for a function or transformation. It lifts slightly on hover.",
  play: "A right-pointing triangle for starting or resuming playback. It shifts right on hover.",
  pause:
    "Two vertical bars for pausing playback. They contract slightly together on hover.",
  stepForward:
    "A play triangle facing an endpoint for advancing one step. It shifts right on hover.",
  stop: "A rounded square for stopping playback or execution. It contracts slightly on hover.",
  reset:
    "A backward circular arrow for returning to an initial state. The arrow rotates backward on hover.",
  plus: "A plus sign for adding an item or increasing a value. It grows slightly on hover.",
  minus:
    "A minus sign for removing an item or decreasing a value. It contracts slightly on hover.",
  close:
    "A diagonal cross for closing or dismissing a view. It contracts slightly on hover.",
  check:
    "A checkmark for confirming an action or marking completion. It lifts slightly on hover.",
  search: "A magnifying glass for finding content. It grows slightly on hover.",
  zoomIn:
    "A magnifying glass with a plus sign for increasing magnification. It grows slightly on hover.",
  zoomOut:
    "A magnifying glass with a minus sign for decreasing magnification. It contracts slightly on hover.",
  fitView:
    "Four open corners for fitting content into a viewport. They spread slightly outward on hover.",
  chevronUp:
    "An upward chevron for expanding upward or moving to a previous item. It shifts upward on hover.",
  chevronDown:
    "A downward chevron for expanding downward or moving to a next item. It shifts downward on hover.",
  chevronLeft:
    "A left-pointing chevron for moving backward through items. It shifts left on hover.",
  chevronRight:
    "A right-pointing chevron for moving forward through items. It shifts right on hover.",
} satisfies Record<HashIconName, string>;

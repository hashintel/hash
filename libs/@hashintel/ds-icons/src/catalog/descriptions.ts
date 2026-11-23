import type { HashIconName } from "../hash-icon";

export const descriptions = {
  monitoringInstrument:
    "A screen, controls, and antenna represent a field monitoring instrument.",
  sensor:
    "A probe with a sensing element represents a sensor or measurement transducer.",
  methane:
    "A central atom joined to four smaller atoms represents methane (CH4).",
  carbonDioxide:
    "A central atom double-bonded to two outer atoms represents carbon dioxide (CO2).",
  oxygen:
    "Two matching atoms joined by a double bond represent molecular oxygen (O2).",
  carbonMonoxide:
    "Two different-sized atoms joined by three bonds represent carbon monoxide (CO).",
  hydrogenSulfide:
    "A central atom bonded to two smaller atoms in a bent arrangement represents hydrogen sulfide (H2S).",
  sulfurDioxide:
    "A bent three-atom structure with paired bonds represents sulfur dioxide (SO2).",
  organicCompound:
    "Nested molecular rings represent organic compounds or VOC measurements.",
  radiation:
    "A radiation trefoil represents ionizing radiation or radon monitoring.",
  waterLevel:
    "Waves beside a graduated scale and depth arrow represent water level.",
  waterSplash:
    "A splash and droplets represent surface wetness or splashing water.",
  particulateMatter1:
    "The PM1 mark identifies a particulate-matter size class.",
  particulateMatter2Point5:
    "The PM2.5 mark identifies a particulate-matter size class.",
  particulateMatter10:
    "The PM10 mark identifies a particulate-matter size class.",
  particulateMatterTotal:
    "The TSP mark surrounded by particles represents total suspended particulates.",
  pressureDifferential:
    "Opposing arrows across a divider represent a pressure difference.",
  fluidFlow: "An arrow between parallel pipe walls represents fluid flow.",
  dewPoint: "A droplet beside a thermometer represents dew point.",
  cloudRain: "A cloud with falling rain represents rainfall or precipitation.",
  battery:
    "A battery case and terminal represent a battery or portable power source.",
  batteryLow:
    "A battery with one short charge bar represents a low battery level.",
  batteryLevel:
    "A battery with three charge bars represents battery level or remaining charge.",
  batteryBolt:
    "A lightning bolt inside a battery represents voltage, electrical power, or charging.",
  signalStrength: "Four ascending bars represent received signal strength.",
  bookmark:
    "A ribbon-shaped bookmark represents saved content or quick access.",
  cloudLightning: "A cloud with a lightning bolt represents a thunderstorm.",
  cloudSun:
    "A sun emerging behind a cloud represents weather conditions or a weather data feed.",
  contactCard:
    "A portrait and contact lines on a card represent a contact record.",
  folderOpen:
    "An open folder represents browsing or opening a collection of files.",
  ghost: "A ghost represents a hidden presence or impersonation mode.",
  hardDrive: "A drive enclosure and status lights represent local storage.",
  heartPulse:
    "A heartbeat trace inside a heart represents health or system vitality.",
  imagePlus:
    "An image frame with a plus represents adding or uploading an image.",
  locationPlus: "A map marker containing a plus represents adding a location.",
  router:
    "An antenna-equipped hub with status lights represents a router or telemetry hub.",
  cloudUpload:
    "An upward arrow entering a cloud represents uploading data to a remote service.",
  move: "Four cardinal arrows represent moving or panning in any direction.",
  rectanglesOffset: "Three offset rectangles represent alternative views.",
  gridPacked: "Four rectangles packed into two rows represent packing items.",
  chevronsRight: "Two chevrons point right.",
  chevronsLeft: "Two chevrons point left.",
  checksStacked:
    "Two check marks stacked vertically represent completed actions.",
  scribbleSwatch:
    "A dense diagonal scribble represents a freeform brush swatch.",
  pencilBaseline:
    "A pencil above a horizontal baseline represents writing on a line.",
  presentationScreen: "A blank screen on a stand represents a presentation.",
  truckRampBox:
    "A truck with a ramp and unloading box represents loading freight.",
  truckContainerFast:
    "A container truck with speed lines represents freight in transit.",
  gaugeMax:
    "A gauge with its needle at the maximum represents maximum capacity.",
  sparklesCluster: "Three four-pointed sparkles represent a sparkling effect.",

  leftToLine:
    "An arrow pointing left toward a vertical line represents returning to an edge.",
  calendarBlank: "A calendar with no marked date represents a calendar.",
  fileVideoCamera:
    "A document containing a video camera represents a video file.",
  filterList: "A funnel beside short rows represents filtering a list.",
  gridNine: "Nine small squares represent a grid of applications.",
  inboxArrowRight:
    "An inbox with a right-arrow badge represents outgoing messages.",
  noteTopFold: "A square note with a folded upper corner represents a note.",
  pagePlain: "A page with a clipped upper corner represents a plain page.",
  peopleGroup: "Three full figures represent a group of people.",
  pizzaPie: "A circular pizza with a separated slice represents pizza.",
  asteriskBolt:
    "An asterisk with a lightning bolt represents creating an entity.",
  noteBolt: "A note with a lightning bolt represents creating a quick note.",
  codePen: "The CodePen mark represents CodePen.",
  collapseDiagonal: "Two diagonal arrows point toward the center.",
  lightbulbRays: "A light bulb surrounded by rays represents an idea.",
  shapesThree: "A triangle, circle and square represent geometric shapes.",
  diagramNestedBranches:
    "Two boxes connected by an elbow represent nested items.",
  networkHub:
    "A central node linked to three surrounding nodes represents a network.",
  arrowsRotateClockwise:
    "Two clockwise arrows represent refresh or synchronization.",
  rotateClockwise: "One clockwise circular arrow represents rotating right.",
  chartBars: "Three columns without axes represent a bar chart.",
  chartLineAxes:
    "A line chart within horizontal and vertical axes represents a trend.",
  sidebarList:
    "A split panel with rows in its sidebar represents a navigation sidebar.",
  twoLayers: "Two stacked diamond layers represent layers.",
  layerPlusAbove:
    "Two stacked layers with an upper plus represent creating layers.",
  stackLinesHorizontal: "Four vertical lines represent a horizontal stack.",
  stackLinesVertical: "Four horizontal lines represent a vertical stack.",
  alignBarBottom: "A bar aligned to a lower edge represents bottom alignment.",
  alignBarTop: "A bar aligned to an upper edge represents top alignment.",
  alignBarLeft: "A bar aligned to a left edge represents left alignment.",
  alignBarRight: "A bar aligned to a right edge represents right alignment.",
  alignBarHorizontal:
    "A horizontal bar on a vertical axis represents horizontal centering.",
  alignBarVertical:
    "A vertical bar on a horizontal axis represents vertical centering.",
  triangleRight: "A right-facing triangle represents a triangular arrowhead.",
  triangleLeft:
    "A left-facing triangle represents a reversed triangular arrowhead.",
  aspectRatioCorners: "Nested corners within a square represent aspect ratio.",
  undoBent: "A bent arrow points left to represent undo.",
  speechWave: "Three vertical strokes represent a voice sample.",
  lockPlain: "A padlock without a keyhole represents a locked state.",
  unlockPlain:
    "An open padlock without a keyhole represents an unlocked state.",
  gripDotsVertical: "Six dots in two columns represent a drag handle.",
  thoughtCloud:
    "A cloud-shaped thought bubble with two small trailing circles represents thought.",

  stars:
    "A five-pointed star with two smaller sparkles represents recognition or acknowledgements.",
  shootingStar:
    "A five-pointed star with trailing streaks represents a shooting star.",
  fileCertificate:
    "A document with a ribbon seal represents a license or certificate.",
  road: "A road with a dashed center line represents a route or roadmap.",
  personSparkles:
    "A standing person beside sparkles represents personal preferences.",
  shield: "An unmarked shield represents protection or privacy.",
  comment: "An oval speech bubble represents a comment or conversation.",
  comments: "Two overlapping oval speech bubbles represent a conversation.",
  commentQuote:
    "Quotation marks in an oval speech bubble represent a quoted comment.",
  spinnerDots: "A ring of separate dots represents work in progress.",
  layerUpload:
    "Two stacked layers beneath an upward arrow represent updating layers.",
  infinityPlus:
    "An infinity loop with a plus represents adding a recurring flow.",
  satelliteDish: "A dish receiving radio waves represents a signal or trigger.",
  hourglass: "An hourglass represents a wait or elapsed time.",
  noteList:
    "A note with a folded lower corner and list marks represents a memo.",
  rectanglePointer:
    "A pointer over a rectangular chip represents selecting a chip.",
  usersThree: "Three busts represent a group of people.",
  triangleNodes: "Three connected circular nodes form a triangular network.",
  arrowDownToBar:
    "An arrow pointing down toward a bar represents alignment to that edge.",
  arrowLeftToBar:
    "An arrow pointing left toward a bar represents alignment to that edge.",
  arrowUpToBar:
    "An arrow pointing up toward a bar represents alignment to that edge.",
  arrowRightToBar:
    "An arrow pointing right toward a bar represents alignment to that edge.",
  arrowDownLeftToCorner:
    "An arrow pointing toward the downleft corner represents corner alignment.",
  arrowUpLeftToCorner:
    "An arrow pointing toward the upleft corner represents corner alignment.",
  arrowUpRightToCorner:
    "An arrow pointing toward the upright corner represents corner alignment.",
  arrowDownRightToCorner:
    "An arrow pointing toward the downright corner represents corner alignment.",
  alignCenterMark:
    "Four marks surrounding a dot represent centering in both directions.",
  bringForwardArrow:
    "An upward arrow under one bar represents bringing an object forward.",
  bringToFrontArrow:
    "An upward arrow under two bars represents bringing an object to the front.",
  sendBackwardArrow:
    "A downward arrow above one bar represents sending an object backward.",
  sendToBackArrow:
    "A downward arrow above two bars represents sending an object to the back.",
  clipboardCopy:
    "A clipboard and dotted selection represent copying to the clipboard.",
  disc: "A solid circular swatch represents a color or visible mark.",
  circleDashed: "A dashed circular outline represents a dashed stroke.",
  circleDotted: "A dotted circular outline represents a dotted stroke.",
  circleDrawn: "An uneven circular outline represents a hand-drawn stroke.",
  layerFillNone: "Overlapping squares show the none fill treatment.",
  layerFillPattern: "Overlapping squares show the pattern fill treatment.",
  layerFillSemi: "Overlapping squares show the semi fill treatment.",
  layerFillSolid: "Overlapping squares show the solid fill treatment.",
  fontSansAa:
    "Uppercase and lowercase A in a sans-serif style represent sans-serif text.",
  fontMonoAa:
    "Uppercase and lowercase A with equal widths represent monospaced text.",
  fontSerifAa: "Serif uppercase and lowercase A represent serif text.",
  fontDrawAa:
    "Hand-drawn uppercase and lowercase A represent handwritten text.",
  fontMixedAa:
    "A small sans-serif a above a serif A represents mixed typefaces.",
  ovalVertical: "An upright oval represents an oval shape.",
  parallelogramLeft: "A parallelogram slanting left represents a skewed shape.",
  groupDashed: "A dashed square represents a grouped selection.",
  ungroupDashed: "A slashed dashed square represents ungrouping a selection.",
  gridDots: "Nine dots in a square represent mixed or multiple values.",
  questionMark:
    "An unenclosed question mark represents an unknown value or help.",
  zoomReset: "A magnifier with a reset arrow represents resetting zoom.",
  rotateSquareClockwise:
    "A clockwise arrow around a square represents rotating an object right.",
  rotateSquareCounterclockwise:
    "A counterclockwise arrow around a square represents rotating an object left.",
  rulerCorner: "An L-shaped ruler represents measuring or guides.",
  slidersVertical: "Two vertical sliders represent adjustable settings.",
  sizeLetterSmall: "A capital S represents small text.",
  sizeLetterMedium: "A capital M represents medium text.",
  sizeLetterLarge: "A capital L represents large text.",
  sizeLetterExtraLarge: "The letters XL represent extra-large text.",
  cornerCurve: "A curved corner represents a curved connector.",
  cornerLine: "A right-angle corner represents a straight connector.",
  stretchBarsHorizontal:
    "A horizontal bar between vertical edges represents stretching horizontally.",
  stretchBarsVertical:
    "A vertical bar between horizontal edges represents stretching vertically.",
  lineDiagonal: "A single diagonal stroke represents a line.",
  textCapital: "A single capital T represents a text tool.",
  caretDown: "A solid downward triangle represents a dropdown.",
  caretUp: "A solid upward triangle represents an upward disclosure.",
  arrowsTurnToDots: "Two turning arrows point toward separate dots.",
  diagramBranch:
    "Three square nodes connected by a branching line represent a project graph.",
  fileExcel: "A document marked X represents a spreadsheet file.",
  boxesTransfer:
    "Two boxes and an upward arrow represent packing or transferring boxes.",
  memo: "An unfolded rectangular page with short lines represents a memo.",
  memoCircleInfo:
    "A memo with a circular information badge represents a note with details.",
  banknoteTransfer:
    "A banknote surrounded by arrows represents a money transfer.",
  columnsMasonry: "Offset blocks in two columns represent a masonry layout.",
  robotBust: "A robot head above a mechanical torso represents a robot user.",
  greetingBust:
    "A waving person shown from the waist up represents a greeting.",
  hierarchyBranches:
    "A parent node branching to child nodes represents links in a hierarchy.",
  circlePlus: "A plus centered inside a circle represents adding an item.",
  squarePlus: "A plus centered inside a square represents adding an item.",
  penSquare: "A pencil crossing an open square represents editing.",
  functionExpression:
    "An f followed by a parenthesized x represents a function expression.",
  inputField: "A rectangular input with a text cursor represents a text field.",
  treeList: "A vertical branch beside three short rows represents a tree list.",
  overlappingCircles: "Three overlapping circles represent intersecting sets.",
  terminalPrompt: "A chevron and underscore represent a command prompt.",
  featherQuill: "A curved feather with a central shaft represents writing.",
  slidersHorizontalThree:
    "Three horizontal sliders represent adjustable settings.",
  barsDescending: "Three bars of decreasing width represent sorting.",
  arrowsUpDown:
    "Two opposing vertical arrows represent a bidirectional sort or transfer.",
  arrowsFromCenterLine: "Two arrows point away from a central horizontal line.",
  arrowsToCenterLine: "Two arrows point toward a central horizontal line.",
  canvasPlus: "A rectangle with a plus badge represents creating a canvas.",
  fileCirclePlus: "A document with a circled plus represents creating a file.",
  earthAmericas: "A globe showing the Americas represents the Earth.",

  toolbox:
    "A handled tool case represents a toolkit or collection of utilities.",
  tools:
    "A wrench and screwdriver represent tools, maintenance, or technical setup.",
  wind: "Curving air currents represent wind, airflow, or lightness.",
  flame: "A flame represents heat, fire, urgency, or sustained activity.",
  circleThreeQuarters:
    "A three-quarter-filled circle represents work that is nearing completion.",
  circleHalf: "A half-filled circle represents work that is in progress.",
  chartHeatmap:
    "Cells with different intensities represent a heatmap or matrix of values.",
  chartScatter:
    "Separate plotted points represent a scatter chart or distribution.",
  boxOpen:
    "An open box represents unpacking, contents, or an available package.",
  cloud: "A cloud represents hosted services or remote computing.",
  circleTag: "A tag in a circle represents a label or categorized item.",
  circleAsterisk:
    "An asterisk in a circle represents a marked entity type or required item.",
  flag: "A notched flag represents a marker, milestone, or report.",
  diceD20:
    "A faceted twenty-sided die represents randomness or a tabletop game.",
  circleFour: "The numeral four in a circle represents a fourth step or item.",
  circleThree: "The numeral three in a circle represents a third step or item.",
  circleTwo: "The numeral two in a circle represents a second step or item.",
  survey: "A form with choices represents a survey or questionnaire.",
  specification:
    "A document with a verification mark represents a specification.",
  plugCheck: "A plug beside a check represents a successful connection.",
  targetArrow:
    "An arrow meeting a target represents an objective or precise action.",
  layerPlus: "Layers and a plus represent adding a layer.",
  gridPlus: "Grid cells and a plus represent adding a view or item.",
  entityEdit: "An entity and pencil represent editing an entity.",
  entityPlus: "An entity with a plus represents creating a new entity.",
  entity: "A connected three-dimensional object represents an entity.",
  typeInheritance:
    "A parent type connected to derived types represents inheritance.",
  tableTree: "Rows joined by branch lines represent a hierarchical table.",
  timelineArrow:
    "Timed events below an arrow represent progression along a timeline.",
  timeline: "Offset bars along a time axis represent a schedule or timeline.",
  workflow: "Connected steps represent a workflow or process.",
  sitemap:
    "A parent box connected to children represents a hierarchy or site map.",
  diagramSankey: "Bands splitting and joining represent a Sankey flow diagram.",
  hexagonNodes: "Six connected nodes represent a cyclic network.",
  chartNetwork: "Connected vertices represent a network or graph chart.",
  cctvCamera:
    "An angled surveillance camera represents monitoring or security footage.",
  tombstone:
    "A rounded memorial stone represents a tombstone or deleted record.",
  teddyBear: "A soft toy bear represents toys, childhood, or comfort.",
  partyHorn: "A cone with celebratory marks represents a party or celebration.",
  cookie: "A bitten biscuit represents a cookie or browser cookie setting.",
  pizza: "A triangular slice with toppings represents pizza.",
  palmTree:
    "A curved trunk and fronds represent a palm tree or tropical destination.",
  lifeRing: "A rescue ring represents help or support.",
  lighthouse: "A beacon tower represents guidance or navigation.",
  hammer: "A striking tool represents building, repair, or manual work.",
  trophy: "A cup on a pedestal represents an award or achievement.",
  gem: "A faceted jewel represents value, rarity, or a premium item.",
  swatchBook: "Fanned color cards represent a set of swatches.",
  palette: "A paint palette represents colors or artistic styling.",
  rocket: "A pointed craft with fins represents launching or rapid progress.",
  telescope:
    "An angled viewing tube represents distant observation or exploration.",
  binoculars: "Paired viewing lenses represent observation or discovery.",
  mortarPestle:
    "A grinding bowl and pestle represent pharmacy or material preparation.",
  flaskVial: "A flask beside a vial represents laboratory samples or reagents.",
  testTubes: "Two tilted sample tubes represent laboratory experiments.",
  biohazard: "Three interlocking lobes represent a biological hazard.",
  virus: "A particle with projecting spikes represents a virus.",
  atom: "Crossing orbital paths around a nucleus represent an atom.",
  solarSystem: "Several orbital paths and bodies represent a solar system.",
  orbit:
    "A body and an orbital path represent orbital motion or a connected system.",
  radar: "Concentric rings and a sweep represent detection or monitoring.",
  antenna:
    "An antenna radiating waves represents broadcast or wireless communication.",
  thermometerCold:
    "A thermometer beside a snowflake represents low temperature.",
  thermometerHot: "A thermometer beside a sun represents high temperature.",
  thermometer: "A graduated bulb represents temperature.",
  humidity: "A water droplet represents moisture or humidity.",
  vibration: "Wavy marks beside a device represent vibration.",
  signal: "Vertical waveform bars represent a signal or audio activity.",
  wavePulse:
    "A sharply changing waveform represents a pulse or live measurement.",
  waves: "Parallel waves represent flowing water or repeated oscillation.",
  sunMoon:
    "A sun beside a crescent represents switching between light and dark themes.",
  moon: "A crescent represents night or a dark theme.",
  sun: "A radiating disc represents sunlight or a light theme.",
  gauge: "A dial with a needle represents a measured level or performance.",
  presentationChart: "A chart on an easel represents presenting data.",
  pieChart:
    "A circle divided into sectors represents proportions in a pie chart.",
  chartMixed:
    "Bars and a line represent a chart combining multiple data series.",
  chartRevenue:
    "A rising chart with a currency mark represents revenue or financial growth.",
  receipt: "An itemized slip represents a receipt or transaction record.",
  handDollar:
    "An open hand beneath a currency mark represents a payment or donation.",
  moneyTransfer:
    "Opposed arrows around a currency mark represent a transfer of funds.",
  coins: "Stacked coins represent funds or accumulated value.",
  dollar: "A dollar sign represents money, pricing, or currency.",
  towerControl: "An elevated glazed tower represents air traffic control.",
  truckPlane:
    "A truck beneath an aircraft represents combined road and air transport.",
  planeArrival: "An aircraft approaching a runway represents arrival.",
  planeDeparture: "An aircraft lifting from a runway represents departure.",
  planeTail:
    "A swept vertical fin in side profile represents an aircraft tail.",
  jet: "A swept-wing aircraft represents a jet.",
  planeUp:
    "An upward-facing airplane represents an aircraft or flight heading.",
  plane: "An airplane represents air travel or aviation.",
  gift: "A ribbon-wrapped box represents a gift or reward.",
  shoppingBasket: "A handled basket represents shopping or selected goods.",
  shoppingCart: "A wheeled basket represents purchases or a shopping cart.",
  truckRamp:
    "A truck with a loading ramp represents loading or unloading goods.",
  truckFast: "A truck with motion strokes represents expedited delivery.",
  truckContainer:
    "A truck with a corrugated body represents container transport.",
  personDolly:
    "A person pushing a loaded trolley represents manual goods handling.",
  forklift:
    "A lifting vehicle represents warehouse handling or material movement.",
  conveyorBelt: "A carton above rollers represents a conveyor belt.",
  shelves: "Stored cartons on shelves represent stocked inventory.",
  boxLocation: "A carton with a map marker represents a package location.",
  boxesPacking: "An open carton represents packing or unpacking goods.",
  pack: "A packed container represents a grouped shipment or bundle.",
  boxes: "Stacked cartons represent inventory or multiple packages.",
  box: "A sealed carton represents a package or inventory item.",
  graduationCap: "An academic cap represents education or achievement.",
  briefcase:
    "A handled case represents work, business, or a professional role.",
  route: "A winding path between points represents a route or journey.",
  globeStand: "A globe on a stand represents geography or global knowledge.",
  globePointer: "A globe and pointer represent navigating the web.",
  globeNodes:
    "A globe with connection points represents an international network.",
  globe: "A globe represents the world, the web, or international reach.",
  crosshairs: "Intersecting guides represent targeting or precise positioning.",
  compass: "A compass needle represents direction or navigation.",
  mapPin: "A marker over a map represents locating a place.",
  map: "A folded map represents an area or geographic information.",
  locationCheck: "A map marker with a check represents a confirmed location.",
  location: "A map marker represents a location or address.",
  shop: "A building with an awning represents a shop or retail location.",
  warehouse: "A broad building with a loading door represents a warehouse.",
  factory: "A sawtooth roof and chimney represent manufacturing.",
  bank: "A columned building represents a bank or public institution.",
  home: "A roofed house represents home or a main landing page.",
  city: "Several buildings represent a city or urban area.",
  buildingShield:
    "A building and shield represent organizational protection or compliance.",
  buildingSearch:
    "A building and magnifier represent researching an organization.",
  building: "A multi-storey building represents an organization or office.",
  pullRequest:
    "A returning branch represents a pull request or proposed merge.",
  codeBranch: "A split line with endpoints represents a code branch.",
  codeEdit: "Code brackets beside a pencil represent editing source code.",
  cloudDownload:
    "A cloud with a downward arrow represents downloading from cloud storage.",
  binary: "Ones and zeros represent binary data.",
  scanner: "An open scanning bed represents a document scanner.",
  scanLine: "A line across corner guides represents scanning content.",
  magneticMedia:
    "A tape cassette beside a disc represents magnetic and optical media.",
  devices: "A desktop screen beside a phone represents multiple devices.",
  calculator: "A keypad and display represent a calculator.",
  creditCard: "A card with a payment strip represents a credit or debit card.",
  microchip:
    "An integrated circuit represents processing hardware or computation.",
  database: "A cylindrical stack represents a database.",
  server: "Stacked equipment bays represent a server.",
  app: "A rounded application tile represents an app.",
  browser: "A window with a toolbar represents a web browser.",
  laptop: "A folding screen and keyboard represent a laptop computer.",
  monitor: "A screen on a stand represents a desktop display.",
  brain: "Two connected lobes represent thought, intelligence, or cognition.",
  heart: "A heart represents care, affection, or a favorite.",
  sad: "A frowning face represents sadness or negative feedback.",
  smile: "A smiling face represents happiness or positive feedback.",
  handshake: "Two joined hands represent agreement or partnership.",
  thumbsDown: "A lowered thumb represents disapproval or a negative reaction.",
  thumbsUp: "A raised thumb represents approval or a positive reaction.",
  hospitalUser:
    "A person beside a medical cross represents a patient or care recipient.",
  expertInterviews:
    "A person beside a speech bubble represents an expert interview.",
  peopleArrows:
    "People with opposing arrows represent exchange or collaboration.",
  family: "Adults and a child represent a family or household.",
  personBooth:
    "A figure using an enclosed booth represents a private session or service point.",
  personPortal:
    "A figure entering a doorway represents access or a transition.",
  personSign:
    "A person beside a placard represents advocacy or public communication.",
  personGreeting: "A person raising a hand represents a greeting or welcome.",
  accessibility: "A figure with open arms represents accessibility.",
  person: "A standing figure represents a person.",
  userBountyHunter:
    "A helmeted figure represents a bounty hunter or specialist investigator.",
  userTag: "A person and tag represent a user role or label.",
  userSearch: "A person and magnifier represent finding or inspecting a user.",
  userLock: "A person and padlock represent restricted account access.",
  userTie:
    "A person wearing a tie represents a professional or account representative.",
  users: "Two people represent a group, audience, or team.",
  searchChart: "A magnifier with bars represents investigating data or trends.",
  searchDollar:
    "A magnifier with a currency mark represents researching prices or costs.",
  searchEmpty: "A magnifier with a dash represents no search results.",
  searchCheck: "A magnifier with a check represents a confirmed search result.",
  speaker: "A speaker with sound waves represents audio output.",
  phoneOff: "A crossed handset represents ending or disabling a call.",
  phone: "A telephone handset represents calling or telephone contact.",
  megaphone: "A horn represents an announcement or broadcast.",
  shareNodes:
    "Three connected points represent distributing content to others.",
  share: "An arrow leaving a tray represents sharing content.",
  send: "A paper plane represents sending or sharing a message.",
  inbox: "An open tray represents received messages or incoming work.",
  messageQuestion: "A speech bubble with a question represents an inquiry.",
  messageDollar:
    "A speech bubble with a currency mark represents a pricing conversation.",
  message: "A speech bubble represents a message or comment.",
  mailUnread: "An envelope with a dot represents unread email.",
  mail: "An envelope represents email or a message.",
  ballotCheck: "A checked selection on a ballot represents an approved choice.",
  badgeCheck:
    "A check in a seal represents verified identity or certification.",
  shieldAlert: "A shield with an exclamation mark represents a security alert.",
  shieldCheck: "A shield with a check represents verified protection.",
  listTimeline:
    "Entries connected along a vertical line represent a chronological list.",
  listCheck: "Checked entries represent a task list.",
  listOrdered: "Numbered lines represent an ordered list.",
  quote: "Paired quotation marks represent a quotation or testimonial.",
  textAlignJustify: "Equal-width lines represent justified text.",
  textAlignCenter: "Centered lines represent centered text.",
  textAlignRight: "Lines sharing a right edge represent right-aligned text.",
  textAlignLeft: "Lines sharing a left edge represent left-aligned text.",
  percent: "A slash between two circles represents a percentage.",
  hashtag:
    "Crossed parallel strokes represent a hashtag or numbered identifier.",
  fontCase: "An uppercase A beside a lowercase a represents letter case.",
  fontDraw: "An irregular A represents a handwritten typeface.",
  fontMono: "A wide I with equal horizontal bars represents monospaced text.",
  fontSerif: "A bracketed A represents a serif typeface.",
  fontSans: "A plain A represents a sans-serif typeface.",
  strikethrough: "A struck-through S represents strikethrough formatting.",
  underline: "An underlined U represents underline formatting.",
  italic: "A slanted I represents italic text formatting.",
  bold: "A bold B represents bold text formatting.",
  mixed: "Different marks represent a mixture of property values or styles.",
  splitView: "A divided panel represents a split view.",
  rows: "Two horizontal panels represent a row layout.",
  columns: "Two vertical panels represent a column layout.",
  rectanglesMixed:
    "Rectangles of different proportions represent a mixed layout.",
  sendToBack:
    "A square beneath stacked outlines represents moving an object to the back.",
  bringToFront:
    "A square above stacked outlines represents moving an object to the front.",
  sendBackward:
    "An overlapping background square represents moving an object back one layer.",
  bringForward:
    "An overlapping foreground square represents moving an object forward one layer.",
  ungroup: "Separated shapes represent ungrouping objects.",
  group:
    "Corner brackets enclosing a shape represent grouping selected objects.",
  stackVertical: "Adjacent panels represent stacking objects vertically.",
  stackHorizontal: "Adjacent panels represent stacking objects horizontally.",
  distributeVertical:
    "Evenly spaced bars between guides represent distributing objects vertically.",
  distributeHorizontal:
    "Evenly spaced bars between guides represent distributing objects horizontally.",
  alignBottomRight:
    "A square at the bottom right of a frame represents content alignment.",
  alignBottomCenter:
    "A square at the bottom center of a frame represents content alignment.",
  alignBottomLeft:
    "A square at the bottom left of a frame represents content alignment.",
  alignCenterRight:
    "A square at the center right of a frame represents content alignment.",
  alignCenterCenter:
    "A square at the center center of a frame represents content alignment.",
  alignCenterLeft:
    "A square at the center left of a frame represents content alignment.",
  alignTopRight:
    "A square at the top right of a frame represents content alignment.",
  alignTopCenter:
    "A square at the top center of a frame represents content alignment.",
  alignTopLeft:
    "A square at the top left of a frame represents content alignment.",
  alignCenterVertical:
    "Two centered bars represent aligning objects along a shared vertical center.",
  alignCenterHorizontal:
    "Two centered bars represent aligning objects along a shared horizontal center.",
  alignBottom:
    "Two bars against an edge represent aligning objects to the bottom.",
  alignTop: "Two bars against an edge represent aligning objects to the top.",
  alignRight:
    "Two bars against an edge represent aligning objects to the right.",
  alignLeft: "Two bars against an edge represent aligning objects to the left.",
  sizeExtraLarge:
    "A extralarge square represents the corresponding drawing size.",
  sizeLarge: "A large square represents the corresponding drawing size.",
  sizeMedium: "A medium square represents the corresponding drawing size.",
  sizeSmall: "A small square represents the corresponding drawing size.",
  fillPattern: "Diagonal hatching inside a square represents a patterned fill.",
  fillSemi: "A partially shaded square represents a translucent fill.",
  fillSolid: "A solid square represents an opaque fill.",
  fillNone: "A crossed empty square represents no fill.",
  pencilRuler:
    "A pencil and marked ruler represent design or construction tools.",
  pencilSlash: "A struck-through pencil represents disabling editing.",
  highlighter: "A broad pen tip represents highlighting content.",
  eraser: "An angled eraser represents removing drawn content.",
  canvas: "A bordered work area represents a drawing canvas.",
  aspectRatio: "Opposing corners inside a rectangle represent an aspect ratio.",
  frame: "Intersecting edge guides represent a frame or bounded canvas region.",
  roundedCorner: "A rounded bend represents a corner-radius setting.",
  splineCubic: "A curved segment between points represents a smooth connector.",
  splineLine:
    "A straight segment between points represents a linear connector.",
  dashDraw: "An uneven stroke represents a hand-drawn line.",
  dashDotted: "Evenly spaced dots represent a dotted line.",
  dashDashed: "Separated strokes represent a dashed line.",
  dashSolid: "An uninterrupted stroke represents a solid line.",
  arrowheadNone: "A plain line represents an endpoint without an arrowhead.",
  arrowheadTriangleInverted:
    "A reversed triangular arrowhead represents an inverted line ending.",
  arrowheadTriangle:
    "A triangular arrowhead represents a closed arrow line ending.",
  arrowheadSquare: "A square represents a square line ending.",
  arrowheadDot: "A circle represents a dotted line ending.",
  arrowheadDiamond: "A diamond represents a diamond line ending.",
  arrowheadBar: "A perpendicular bar represents a barred line ending.",
  arrowheadArrow: "An open arrowhead represents an arrow line ending.",
  shapeArrowUp: "A block arrow pointing up represents a directional shape.",
  shapeArrowLeft: "A block arrow pointing left represents a directional shape.",
  shapeArrowDown: "A block arrow pointing down represents a directional shape.",
  shapeArrowRight:
    "A block arrow pointing right represents a directional shape.",
  blob: "An irregular rounded outline represents a freeform shape.",
  trapezoid:
    "A quadrilateral with unequal parallel edges represents a trapezoid shape.",
  parallelogram: "A slanted quadrilateral represents a parallelogram shape.",
  octagon: "An eight-sided outline represents an octagon shape.",
  hexagon: "A six-sided outline represents a hexagon shape.",
  pentagon: "A five-sided outline represents a pentagon shape.",
  triangle: "A triangular outline represents a triangle shape.",
  diamond: "A diamond outline represents a diamond shape or decision.",
  ellipse: "An oval outline represents an ellipse shape.",
  rectangle: "A rectangular outline represents a rectangle shape.",
  key: "A key represents credentials, access, or an API secret.",
  paperclip: "A bent wire fastener represents an attachment.",
  keyboard: "Rows of keys represent a keyboard or keyboard input.",
  keycapA:
    "The A legend inside a keycap represents the A key in a keyboard shortcut.",
  keycapB:
    "The B legend inside a keycap represents the B key in a keyboard shortcut.",
  keycapC:
    "The C legend inside a keycap represents the C key in a keyboard shortcut.",
  keycapD:
    "The D legend inside a keycap represents the D key in a keyboard shortcut.",
  keycapE:
    "The E legend inside a keycap represents the E key in a keyboard shortcut.",
  keycapF:
    "The F legend inside a keycap represents the F key in a keyboard shortcut.",
  keycapG:
    "The G legend inside a keycap represents the G key in a keyboard shortcut.",
  keycapH:
    "The H legend inside a keycap represents the H key in a keyboard shortcut.",
  keycapI:
    "The I legend inside a keycap represents the I key in a keyboard shortcut.",
  keycapJ:
    "The J legend inside a keycap represents the J key in a keyboard shortcut.",
  keycapK:
    "The K legend inside a keycap represents the K key in a keyboard shortcut.",
  keycapL:
    "The L legend inside a keycap represents the L key in a keyboard shortcut.",
  keycapM:
    "The M legend inside a keycap represents the M key in a keyboard shortcut.",
  keycapN:
    "The N legend inside a keycap represents the N key in a keyboard shortcut.",
  keycapO:
    "The O legend inside a keycap represents the O key in a keyboard shortcut.",
  keycapP:
    "The P legend inside a keycap represents the P key in a keyboard shortcut.",
  keycapQ:
    "The Q legend inside a keycap represents the Q key in a keyboard shortcut.",
  keycapR:
    "The R legend inside a keycap represents the R key in a keyboard shortcut.",
  keycapS:
    "The S legend inside a keycap represents the S key in a keyboard shortcut.",
  keycapT:
    "The T legend inside a keycap represents the T key in a keyboard shortcut.",
  keycapU:
    "The U legend inside a keycap represents the U key in a keyboard shortcut.",
  keycapV:
    "The V legend inside a keycap represents the V key in a keyboard shortcut.",
  keycapW:
    "The W legend inside a keycap represents the W key in a keyboard shortcut.",
  keycapX:
    "The X legend inside a keycap represents the X key in a keyboard shortcut.",
  keycapY:
    "The Y legend inside a keycap represents the Y key in a keyboard shortcut.",
  keycapZ:
    "The Z legend inside a keycap represents the Z key in a keyboard shortcut.",
  keycap0:
    "The 0 legend inside a keycap represents the 0 key in a keyboard shortcut.",
  keycap1:
    "The 1 legend inside a keycap represents the 1 key in a keyboard shortcut.",
  keycap2:
    "The 2 legend inside a keycap represents the 2 key in a keyboard shortcut.",
  keycap3:
    "The 3 legend inside a keycap represents the 3 key in a keyboard shortcut.",
  keycap4:
    "The 4 legend inside a keycap represents the 4 key in a keyboard shortcut.",
  keycap5:
    "The 5 legend inside a keycap represents the 5 key in a keyboard shortcut.",
  keycap6:
    "The 6 legend inside a keycap represents the 6 key in a keyboard shortcut.",
  keycap7:
    "The 7 legend inside a keycap represents the 7 key in a keyboard shortcut.",
  keycap8:
    "The 8 legend inside a keycap represents the 8 key in a keyboard shortcut.",
  keycap9:
    "The 9 legend inside a keycap represents the 9 key in a keyboard shortcut.",
  keycapBacktick:
    "A keycap with a backtick legend represents the backtick key.",
  keycapTilde: "A keycap with a tilde legend represents the tilde key.",
  keycapExclamation:
    "A keycap with a exclamation mark legend represents the exclamation mark key.",
  keycapAt: "A keycap with a at sign legend represents the at sign key.",
  keycapHash: "A keycap with a hash sign legend represents the hash sign key.",
  keycapDollar:
    "A keycap with a dollar sign legend represents the dollar sign key.",
  keycapPercent: "A keycap with a percent legend represents the percent key.",
  keycapCaret: "A keycap with a caret legend represents the caret key.",
  keycapAmpersand:
    "A keycap with a ampersand legend represents the ampersand key.",
  keycapAsterisk:
    "A keycap with a asterisk legend represents the asterisk key.",
  keycapParenLeft:
    "A keycap with a left parenthesis legend represents the left parenthesis key.",
  keycapParenRight:
    "A keycap with a right parenthesis legend represents the right parenthesis key.",
  keycapMinus: "A keycap with a minus legend represents the minus key.",
  keycapUnderscore:
    "A keycap with a underscore legend represents the underscore key.",
  keycapPlus: "A keycap with a plus legend represents the plus key.",
  keycapEquals: "A keycap with a equals legend represents the equals key.",
  keycapBracketLeft:
    "A keycap with a left square bracket legend represents the left square bracket key.",
  keycapBracketRight:
    "A keycap with a right square bracket legend represents the right square bracket key.",
  keycapBraceLeft:
    "A keycap with a left brace legend represents the left brace key.",
  keycapBraceRight:
    "A keycap with a right brace legend represents the right brace key.",
  keycapBackslash:
    "A keycap with a backslash legend represents the backslash key.",
  keycapPipe: "A keycap with a pipe legend represents the pipe key.",
  keycapSemicolon:
    "A keycap with a semicolon legend represents the semicolon key.",
  keycapColon: "A keycap with a colon legend represents the colon key.",
  keycapQuote:
    "A keycap with a single quote legend represents the single quote key.",
  keycapDoubleQuote:
    "A keycap with a double quote legend represents the double quote key.",
  keycapComma: "A keycap with a comma legend represents the comma key.",
  keycapPeriod: "A keycap with a period legend represents the period key.",
  keycapSlash: "A keycap with a slash legend represents the slash key.",
  keycapQuestion:
    "A keycap with a question mark legend represents the question mark key.",
  keycapLessThan:
    "A keycap with a less-than sign legend represents the less-than sign key.",
  keycapGreaterThan:
    "A keycap with a greater-than sign legend represents the greater-than sign key.",
  keycapF1: "An F1 legend inside a keycap represents the F1 function key.",
  keycapF2: "An F2 legend inside a keycap represents the F2 function key.",
  keycapF3: "An F3 legend inside a keycap represents the F3 function key.",
  keycapF4: "An F4 legend inside a keycap represents the F4 function key.",
  keycapF5: "An F5 legend inside a keycap represents the F5 function key.",
  keycapF6: "An F6 legend inside a keycap represents the F6 function key.",
  keycapF7: "An F7 legend inside a keycap represents the F7 function key.",
  keycapF8: "An F8 legend inside a keycap represents the F8 function key.",
  keycapF9: "An F9 legend inside a keycap represents the F9 function key.",
  keycapF10: "An F10 legend inside a keycap represents the F10 function key.",
  keycapF11: "An F11 legend inside a keycap represents the F11 function key.",
  keycapF12: "An F12 legend inside a keycap represents the F12 function key.",
  keycapEscape: "A labeled keycap represents the Escape key.",
  keycapAlt: "A labeled keycap represents the Alt key.",
  keycapFn: "A labeled keycap represents the Fn key.",
  keycapInsert: "A labeled keycap represents the Insert key.",
  keycapPrintScreen:
    "A keycap with a Print Screen legend represents the Print Screen key.",
  keycapCommand: "A symbol inside a keycap represents the Command modifier.",
  keycapShift: "A symbol inside a keycap represents the Shift modifier.",
  keycapControl: "A symbol inside a keycap represents the Control modifier.",
  keycapOption: "A symbol inside a keycap represents the Option modifier.",
  keycapWindows: "A symbol inside a keycap represents the Windows modifier.",
  keycapTab: "A symbol inside a keycap represents the Tab key.",
  keycapEnter: "A symbol inside a keycap represents the Enter or Return key.",
  keycapBackspace: "A symbol inside a keycap represents the Backspace key.",
  keycapDelete: "A symbol inside a keycap represents the forward Delete key.",
  keycapSpace: "A symbol inside a keycap represents the Space key.",
  keycapCapsLock: "A symbol inside a keycap represents the Caps Lock key.",
  keycapArrowUp: "A symbol inside a keycap represents the Up Arrow key.",
  keycapArrowDown: "A symbol inside a keycap represents the Down Arrow key.",
  keycapArrowLeft: "A symbol inside a keycap represents the Left Arrow key.",
  keycapArrowRight: "A symbol inside a keycap represents the Right Arrow key.",
  keycapHome: "A symbol inside a keycap represents the Home key.",
  keycapEnd: "A symbol inside a keycap represents the End key.",
  keycapPageUp: "A symbol inside a keycap represents the Page Up key.",
  keycapPageDown: "A symbol inside a keycap represents the Page Down key.",
  keycapPause: "A symbol inside a keycap represents the Pause key.",
  keycapNumLock: "A NUM legend inside a keycap represents the Num Lock key.",
  keycapScrollLock:
    "A SCR legend inside a keycap represents the Scroll Lock key.",
  keycapMenu: "A symbol inside a keycap represents the context Menu key.",
  keycapEject: "A symbol inside a keycap represents the Eject key.",
  command:
    "A looped command symbol represents a keyboard modifier or shortcut.",
  toggleOff:
    "A switch with its knob on the left represents a disabled setting.",
  toggleOn:
    "A switch with its knob on the right represents an enabled setting.",
  power: "A broken circle and vertical bar represent power or activation.",
  tag: "A tag represents a label, category, or price.",
  pin: "A pushpin represents keeping an item fixed or prominent.",
  dot: "A small dot represents a point, bullet, or status marker.",
  help: "A question mark in a circle represents help or an explanation.",
  equals: "Two equal bars represent equality.",
  checkDouble:
    "Two check marks represent completed delivery or double confirmation.",
  radioChecked: "A dot inside a circle represents a selected radio option.",
  squareMinus: "A minus in a square represents removing or collapsing an item.",
  squareClose: "A cross in a square represents closing or rejecting an item.",
  circlePlay:
    "A play symbol in a circle represents starting media or an execution.",
  circleUp: "An upward arrow in a circle represents moving to a higher level.",
  circleArrowUpRight:
    "A diagonal arrow in a circle represents opening or navigating outward.",
  circleArrowRight:
    "A right arrow in a circle represents continuing to the next step.",
  arrowPointer: "A directional pointer represents a heading or location.",
  shuffle: "Crossing arrows represent shuffling or rearranging an order.",
  redo: "A returning arrow pointing right represents redoing an action.",
  collapseVertical:
    "Arrows approaching a central line represent collapsing vertical space.",
  expandDiagonal: "Outward diagonal arrows represent enlarging an area.",
  expandVertical: "Outward vertical arrows represent expanding height.",
  expandHorizontal: "Outward horizontal arrows represent expanding width.",
  chevronsUpDown:
    "Opposed chevrons represent increasing or decreasing a selection.",
  arrowProgress:
    "A stepped arrow represents progress through successive stages.",
  arrowTurnDownRight:
    "A bent arrow pointing right represents continuing along a turn.",
  arrowTurnDownLeft:
    "A bent arrow pointing left represents returning or turning left.",
  logout: "An arrow leaving a doorway represents signing out.",
  login: "An arrow entering a doorway represents signing in.",
  upload: "An upward arrow above a tray represents uploading content.",
  historyUser:
    "A person inside a return arrow represents account activity history.",
  historyPages:
    "Documents inside a return arrow represent a page\u2019s revision history.",
  calendars:
    "Overlapping calendars represent multiple schedules or date ranges.",
  calendarCheck: "A calendar with a check represents a confirmed appointment.",
  calendarDays: "A calendar of day cells represents dates or a schedule.",
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
  openSourceInitiative:
    "The Open Source Initiative keyhole mark represents open-source software.",
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

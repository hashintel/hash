// import { absoluteCenter } from "../beta/absolute-center/absolute-center.recipe";
import { accordionSlotRecipe } from "../beta/accordion.recipe";
import { alertSlotRecipe } from "../beta/alert.recipe";
import { angleSlider } from "../beta/angle-slider/angle-slider.recipe";
import { avatarSlotRecipe } from "../beta/avatar.recipe";
import { badgeRecipe } from "../beta/badge.recipe";
import { breadcrumbSlotRecipe } from "../beta/breadcrumb.recipe";
import { buttonRecipe } from "../beta/button.recipe";
import { cardSlotRecipe } from "../beta/card.recipe";
import { carouselSlotRecipe } from "../beta/carousel.recipe";
import { checkboxSlotRecipe } from "../beta/checkbox.recipe";
import { clipboardSlotRecipe } from "../beta/clipboard.recipe";
import { codeRecipe } from "../beta/code.recipe";
import { collapsibleSlotRecipe } from "../beta/collapsible.recipe";
import { colorPickerSlotRecipe } from "../beta/color-picker.recipe";
import { comboboxSlotRecipe } from "../beta/combobox.recipe";
import { datePickerSlotRecipe } from "../beta/date-picker.recipe";
import { dialogSlotRecipe } from "../beta/dialog.recipe";
import { drawerSlotRecipe } from "../beta/drawer.recipe";
import { editableSlotRecipe } from "../beta/editable.recipe";
import { fieldSlotRecipe } from "../beta/field.recipe";
import { fieldsetSlotRecipe } from "../beta/fieldset.recipe";
import { fileUploadSlotRecipe } from "../beta/file-upload.recipe";
import { floatingPanel } from "../beta/floating-panel/floating-panel.recipe";
import { groupRecipe } from "../beta/group.recipe";
import { headingRecipe } from "../beta/heading.recipe";
import { hoverCardSlotRecipe } from "../beta/hover-card.recipe";
import { iconRecipe } from "../beta/icon.recipe";
import { inputRecipe } from "../beta/input.recipe";
import { inputAddonRecipe } from "../beta/input-addon.recipe";
import { inputGroupSlotRecipe } from "../beta/input-group.recipe";
import { kbdRecipe } from "../beta/kbd.recipe";
import { linkRecipe } from "../beta/link.recipe";
import { listbox } from "../beta/listbox/listbox.recipe";
import { menuSlotRecipe } from "../beta/menu.recipe";
import { numberInputSlotRecipe } from "../beta/number-input.recipe";
import { paginationSlotRecipe } from "../beta/pagination.recipe";
import { passwordInput } from "../beta/password-input/password-input.recipe";
import { pinInputSlotRecipe } from "../beta/pin-input.recipe";
import { popoverSlotRecipe } from "../beta/popover.recipe";
import { progressSlotRecipe } from "../beta/progress.recipe";
import { qrCode } from "../beta/qr-code/qr-code.recipe";
import { radioCardGroupSlotRecipe } from "../beta/radio-card-group.recipe";
import { radioGroupSlotRecipe } from "../beta/radio-group.recipe";
import { ratingGroupSlotRecipe } from "../beta/rating-group.recipe";
import { scrollAreaSlotRecipe } from "../beta/scroll-area.recipe";
import { segmentGroupSlotRecipe } from "../beta/segment-group.recipe";
import { selectSlotRecipe } from "../beta/select.recipe";
import { signaturePad } from "../beta/signature-pad/signature-pad.recipe";
import { skeletonRecipe } from "../beta/skeleton.recipe";
import { sliderSlotRecipe } from "../beta/slider.recipe";
import { spinnerRecipe } from "../beta/spinner.recipe";
import { splitterSlotRecipe } from "../beta/splitter.recipe";
import { steps } from "../beta/steps/steps.recipe";
import { switchSlotRecipe } from "../beta/switch.recipe";
import { tableSlotRecipe } from "../beta/table.recipe";
import { tabsSlotRecipe } from "../beta/tabs.recipe";
import { tagsInputSlotRecipe } from "../beta/tags-input.recipe";
import { textRecipe } from "../beta/text.recipe";
import { textareaRecipe } from "../beta/textarea.recipe";
import { timer } from "../beta/timer/timer.recipe";
import { toastSlotRecipe } from "../beta/toast.recipe";
import { toggle } from "../beta/toggle/toggle.recipe";
import { toggleGroupSlotRecipe } from "../beta/toggle-group.recipe";
import { tooltipSlotRecipe } from "../beta/tooltip.recipe";
import { tour } from "../beta/tour/tour.recipe";
import { treeView } from "../beta/tree-view/tree-view.recipe";

export const recipes = {
  // absoluteCenter,
  badge: badgeRecipe,
  button: buttonRecipe,
  code: codeRecipe,
  group: groupRecipe,
  heading: headingRecipe,
  icon: iconRecipe,
  input: inputRecipe,
  inputAddon: inputAddonRecipe,
  kbd: kbdRecipe,
  link: linkRecipe,
  skeleton: skeletonRecipe,
  spinner: spinnerRecipe,
  text: textRecipe,
  textarea: textareaRecipe,
};

export const slotRecipes = {
  accordion: accordionSlotRecipe,
  alert: alertSlotRecipe,
  angleSlider,
  avatar: avatarSlotRecipe,
  breadcrumb: breadcrumbSlotRecipe,
  card: cardSlotRecipe,
  carousel: carouselSlotRecipe,
  checkbox: checkboxSlotRecipe,
  clipboard: clipboardSlotRecipe,
  collapsible: collapsibleSlotRecipe,
  colorPicker: colorPickerSlotRecipe,
  combobox: comboboxSlotRecipe,
  datePicker: datePickerSlotRecipe,
  dialog: dialogSlotRecipe,
  drawer: drawerSlotRecipe,
  editable: editableSlotRecipe,
  field: fieldSlotRecipe,
  fieldset: fieldsetSlotRecipe,
  fileUpload: fileUploadSlotRecipe,
  floatingPanel,
  hoverCard: hoverCardSlotRecipe,
  inputGroup: inputGroupSlotRecipe,
  listbox,
  menu: menuSlotRecipe,
  numberInput: numberInputSlotRecipe,
  pagination: paginationSlotRecipe,
  passwordInput,
  pinInput: pinInputSlotRecipe,
  popover: popoverSlotRecipe,
  progress: progressSlotRecipe,
  radioCardGroup: radioCardGroupSlotRecipe,
  radioGroup: radioGroupSlotRecipe,
  ratingGroup: ratingGroupSlotRecipe,
  scrollArea: scrollAreaSlotRecipe,
  segmentGroup: segmentGroupSlotRecipe,
  select: selectSlotRecipe,
  signaturePad,
  slider: sliderSlotRecipe,
  splitter: splitterSlotRecipe,
  steps,
  switchRecipe: switchSlotRecipe,
  table: tableSlotRecipe,
  tabs: tabsSlotRecipe,
  tagsInput: tagsInputSlotRecipe,
  timer,
  toast: toastSlotRecipe,
  toggle,
  toggleGroup: toggleGroupSlotRecipe,
  tooltip: tooltipSlotRecipe,
  tour,
  treeView,
  qrCode,
};

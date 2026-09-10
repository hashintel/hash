/**
 * The frame kit every Simulate drawer and the full study view build on: the
 * frame itself, the header's stat columns and status pill, the columns, the
 * spanning card and the computing chip. The parts live in `drawer-frame/`,
 * which forms the frame's layer; this file is their one public door.
 */
export {
  DrawerFrame,
  type DrawerFrameProps,
  FRAME_NOTE_HEIGHT,
  type FrameNote,
} from "./drawer-frame/frame";
export {
  FrameStat,
  type FrameStatShort,
  FrameStatusPill,
  type FrameStatusTone,
} from "./drawer-frame/frame-header";
export { FrameColumns } from "./drawer-frame/frame-columns";
export { FrameCard, type FrameCardMore } from "./drawer-frame/frame-card";
export {
  type ComputeBatch,
  ComputeBatchesChip,
} from "./drawer-frame/compute-batches-chip";

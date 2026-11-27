/**
 * @layerRoot core.playback
 * @role The speeds, play states and play modes of playback, and the frame-indexed player of the headless runtime
 */

export {
  createPlayback,
  formatPlaybackSpeed,
  PLAYBACK_SPEEDS,
  type ComputePlayMode,
  type Playback,
  type PlaybackSnapshot,
  type PlaybackSpeed,
  type PlaybackState,
  type PlayMode,
  type TickInput,
  type TickResult,
} from "./playback";

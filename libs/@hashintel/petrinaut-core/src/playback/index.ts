/**
 * @layerRoot core.playback
 * @role Picks the viewed frame over time and defines the per-play-mode backpressure profiles
 */

export {
  createPlayback,
  formatPlaybackSpeed,
  getPlayModeBackpressure,
  PLAYBACK_SPEEDS,
  type ComputePlayMode,
  type Playback,
  type PlaybackSnapshot,
  type PlaybackSpeed,
  type PlaybackState,
  type PlayMode,
  type PlayModeBackpressure,
  type TickInput,
  type TickResult,
} from "./playback";

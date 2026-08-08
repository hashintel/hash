/**
 * @layerRoot core.playback
 * @layerName Playback
 * @role Picks the viewed frame over time and defines the per-play-mode backpressure profiles
 * @invariant Pure state machine — it decides which frame should be shown but never fetches one
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

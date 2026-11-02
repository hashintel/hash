/**
 * @layerRoot core.playback
 * @role Picks the viewed frame over time and defines the per-play-mode backpressure profiles
 */

export {
  createEventPlayback,
  EVENT_PLAY_MODE_LEAD,
  type EventPlayback,
  type EventPlaybackSnapshot,
  type EventTickInput,
  type EventTickResult,
} from "./event-playback";
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

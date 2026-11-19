/**
 * @layerRoot core.playback
 * @role Moves the viewed position of a run, by simulation time or by frame, and defines how far each play mode computes ahead
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

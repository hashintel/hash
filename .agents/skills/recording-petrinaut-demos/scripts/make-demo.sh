#!/usr/bin/env bash
# Converts a recorded take into the standard demo video and extracts check frames.
#
# Usage: make-demo.sh <recording.json> <out.mp4|out.gif> [--fps <n>]
#
# Fixed output, 18 s at 1600x1000 (16:10):
#   .mp4  H.264 High 4.1, yuv420p limited range, 30 fps, faststart, no audio.
#         Plays inline on GitHub (PR bodies, comments) and Slack; the default.
#   .gif  20 fps, per-GIF palette. Only when autoplay matters more than colour
#         depth and size (README embeds); 3-6 MB is typical.
#
# --fps raises the frame rate for a take whose motion needs it (60 for pointer
# glides and cursor animation). Every other demo keeps the default, so a raised
# rate makes this one no longer frame-comparable with the rest of a stack.
#
# --width sets the output width and derives the height at 16:10. Pair it with
# the recorder's --viewport-width: the viewport decides how large the UI reads
# in the frame, this decides the file's resolution. A viewport of half the
# output width gives a HiDPI file that maps 1:1 on a retina display, and no
# rescale at all when it matches the deviceScaleFactor-2 capture.
# Input is the timestamped frame list record-demo.mjs wrote. Check frames land
# next to the output as <stem>--check-<t>.png. Publish the finished file with
# publish-demo.sh, which names it after its PR in the stack's shared folder.
set -euo pipefail

recording="${1:?usage: make-demo.sh <recording.json> <out.mp4|out.gif> [--fps <n>] [--width <px>]}"
out="${2:?usage: make-demo.sh <recording.json> <out.mp4|out.gif> [--fps <n>] [--width <px>]}"
shift 2 || true

fps_override=""
width_override=""
duration_override=""
while [ $# -gt 0 ]; do
  case "$1" in
    --fps) fps_override="${2:?--fps needs a value}"; shift 2 ;;
    --width) width_override="${2:?--width needs a value}"; shift 2 ;;
    --duration) duration_override="${2:?--duration needs a value}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

frames=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['framesList'])" "$recording")

# Must match the recorder's --duration, or the encode cuts the take's tail.
duration="${duration_override:-18}"
width="${width_override:-1600}"
# 16:10, rounded down to an even height: yuv420p subsamples by two, so an odd
# dimension fails the encode outright.
height=$(( width * 10 / 16 / 2 * 2 ))
stem="${out%.*}"

# H.264 levels cap the frame size, and 4.1 stops at 8192 macroblocks, which
# 1600x1000 already fills. A HiDPI output needs the higher ceiling of 5.1.
if [ "$width" -gt 1600 ]; then level=5.1; else level=4.1; fi

case "$out" in
  *.mp4)
    fps="${fps_override:-30}"
    ffmpeg -v error -y -f concat -safe 0 -i "$frames" -t "$duration" \
      -vf "fps=${fps},scale=${width}:${height}:flags=lanczos:in_range=pc:out_range=tv,format=yuv420p" \
      -color_range tv -c:v libx264 -preset slow -crf 18 -profile:v high -level "$level" \
      -movflags +faststart -an "$out"
    ;;
  *.gif)
    fps="${fps_override:-20}"
    ffmpeg -v error -y -f concat -safe 0 -i "$frames" -t "$duration" \
      -filter_complex "[0:v]fps=${fps},scale=${width}:${height}:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
      "$out"
    ;;
  *)
    echo "output must end in .mp4 or .gif" >&2
    exit 2
    ;;
esac

# Quarter points plus the last frame, so the checks scale with the duration.
checkpoints=$(python3 -c "
d = float('$duration')
print(' '.join(f'{p:g}' for p in [0, round(d/3, 1), round(2*d/3, 1), round(d - 0.1, 1)]))
")
for t in $checkpoints; do
  ffmpeg -v error -y -ss "$t" -i "$out" -frames:v 1 "${stem}--check-${t}.png"
done

echo "output: $out"
echo "next: $(dirname "$0")/publish-demo.sh \"$out\" [--pr <number>]  (names it after the PR, into the stack's shared folder)"
echo "size bytes: $(stat -f%z "$out" 2>/dev/null || stat -c%s "$out")"
echo "stream: $(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,pix_fmt,width,height,r_frame_rate,nb_frames -of csv=p=0 "$out")"
echo "duration: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out")"
echo "check frames: ${stem}--check-{$(echo "$checkpoints" | tr ' ' ',')}.png"

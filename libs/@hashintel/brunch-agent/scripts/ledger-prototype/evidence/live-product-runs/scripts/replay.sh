#!/usr/bin/env bash
# Replays a recorded run's user messages, verbatim, into a live persona run
# started without an agent (`yarn brunch:persona --case <case>` with no --agent).
# The launcher sends turn 1 itself, so start from turn 2 on a fresh run.
#
# Usage: replay.sh <source-run-dir> <target-run-dir> <first-turn> <last-turn>
set -euo pipefail
source_run="$1"
target_run="$2"
mkdir -p "$target_run/replay"
for turn in $(seq "$3" "$4"); do
  padded=$(printf '%02d' "$turn")
  node -e '
    const [snapshotPath, turn] = process.argv.slice(1);
    const snapshot = JSON.parse(require("node:fs").readFileSync(snapshotPath, "utf8"));
    const message = snapshot.messages.filter(
      (entry) => entry.role === "user" && entry.purpose === "user",
    )[Number(turn) - 1];
    if (!message) throw new Error(`No user turn ${turn} in ${snapshotPath}`);
    process.stdout.write(
      message.parts.filter((part) => part.type === "text").map((part) => part.text).join(""),
    );
  ' "$source_run/evidence/snapshot.json" "$turn" > "$target_run/replay/turn-$padded.txt"
  "$target_run/bin/persona" say < "$target_run/replay/turn-$padded.txt" \
    > "$target_run/replay/reply-$padded.txt"
  echo "turn $turn: $(head -c 160 "$target_run/replay/reply-$padded.txt" | tr '\n' ' ')"
done

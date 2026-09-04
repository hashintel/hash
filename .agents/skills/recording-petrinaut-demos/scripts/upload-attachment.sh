#!/usr/bin/env bash
# Uploads a finished demo to GitHub's user-attachments store and prints the
# asset URL, so a video can go into a pull request, issue, or comment without
# a browser drag-and-drop.
#
# Usage: upload-attachment.sh <file.mp4|file.gif|file.png> [--repo owner/name] [--name <asset name>]
#
# The repository decides who can see the asset: only people who can read that
# repository can play it. Without --repo the current checkout's repository is
# used. The printed URL belongs on a line of its own in the body text, where
# GitHub's front end turns it into a player; markup around it is stripped.
set -euo pipefail

file="${1:?usage: upload-attachment.sh <file> [--repo owner/name] [--name <asset name>]}"
shift
repo=""
name=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --name) name="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -f "$file" ] || { echo "no such file: $file" >&2; exit 1; }
[ -n "$repo" ] || repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
[ -n "$name" ] || name=$(basename "$file")

case "${file##*.}" in
  mp4) content_type="video/mp4" ;;
  mov) content_type="video/quicktime" ;;
  gif) content_type="image/gif" ;;
  png) content_type="image/png" ;;
  jpg|jpeg) content_type="image/jpeg" ;;
  *) echo "unsupported extension: ${file##*.}" >&2; exit 2 ;;
esac

# The endpoint is undocumented but takes a plain token, and it wants the
# repository's numeric id rather than its name.
repository_id=$(gh api "repos/${repo}" --jq .id)
response=$(curl -sS -X POST \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/json" \
  "https://uploads.github.com/user-attachments/assets?name=$(printf '%s' "$name" | sed 's/ /%20/g')&content_type=${content_type//\//%2F}&repository_id=${repository_id}" \
  --data-binary "@${file}")

url=$(printf '%s' "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("url",""))' 2>/dev/null || true)
if [ -z "$url" ]; then
  echo "upload failed: $response" >&2
  exit 1
fi

echo "asset: $url"
echo "size:  $(du -h "$file" | cut -f1) ($content_type)"
echo
echo "Put that URL bare on its own line in the body. Fetching it yourself"
echo "answers 404 without a session, which is not a failed upload: confirm it"
echo "by rendering the body that carries it, e.g."
echo "  gh api repos/${repo}/pulls/<number> -H 'Accept: application/vnd.github.html+json' --jq .body_html | grep -c '<video'"

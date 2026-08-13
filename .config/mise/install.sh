#!/usr/bin/env bash

# Installs the mise binary to /usr/local/bin from its GitHub release,
# verified against the release's SHASUMS256.txt.

set -euo pipefail

# renovate: datasource=github-releases depName=jdx/mise
MISE_VERSION=2026.7.14

case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *)
    echo "unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

tarball="mise-v${MISE_VERSION}-linux-${arch}.tar.gz"
base_url="https://github.com/jdx/mise/releases/download/v${MISE_VERSION}"

# A token lifts GitHub's anonymous rate limit; unauthenticated installs still work.
# curl never reads these variables itself, so the header has to be passed explicitly.
# Plain `-L` drops `Authorization` when a redirect crosses to another host (only
# `--location-trusted` would keep it), so the token is not handed to the asset CDN.
curl_auth=()
github_token="${MISE_GITHUB_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -n ${github_token} ]]; then
  curl_auth=(--header "Authorization: Bearer ${github_token}")
fi

# Human-readable names for the curl exit codes seen on Vercel builds.
curl_exit_label() {
  case "$1" in
    0) echo "no transport error" ;;
    6) echo "could not resolve host" ;;
    7) echo "could not connect to host" ;;
    22) echo "HTTP error returned" ;;
    28) echo "operation timed out" ;;
    35) echo "TLS connect error" ;;
    56) echo "failure receiving network data" ;;
    *) echo "see EXIT CODES in 'man curl'" ;;
  esac
}

# Downloads $1 to $2. `--fail` is deliberately omitted so that the response body
# survives to be printed: a bare `curl: (22)` explains nothing about why a build broke.
fetch() {
  local url=$1 output=$2
  local headers="${output}.headers"
  local status=000 curl_status=0

  status=$(
    curl -sS -L \
      --retry 5 --retry-all-errors --retry-delay 2 \
      --connect-timeout 10 --max-time 300 \
      ${curl_auth[@]+"${curl_auth[@]}"} \
      --dump-header "${headers}" \
      --write-out '%{http_code}' \
      --output "${output}" \
      "${url}"
  ) || curl_status=$?

  if [[ ${curl_status} -ne 0 || ${status} -lt 200 || ${status} -ge 300 ]]; then
    {
      echo "error: failed to download ${url}"
      echo "  curl exit code: ${curl_status} ($(curl_exit_label "${curl_status}"))"
      echo "  http status:    ${status}"
      grep -iE '^(retry-after|x-ratelimit-[a-z]+):' "${headers}" 2> /dev/null \
        | tr -d '\r' | sed 's/^/  /' || true
      echo "  response body (first 2000 bytes):"
      head -c 2000 "${output}" 2> /dev/null | tr -d '\r' | tr -c '[:print:]\n\t' '.' | sed 's/^/    /'
      echo
    } >&2
    return 1
  fi
}

cd "$(mktemp -d)"

fetch "${base_url}/${tarball}" "${tarball}"
fetch "${base_url}/SHASUMS256.txt" SHASUMS256.txt

# Extract this tarball's entry before verifying, so an error page or a truncated
# response is reported as such rather than as a checksum parse failure. mise emits
# the names with a `./` prefix today; its own installer does not rely on that.
if ! grep -E "^[0-9a-f]{64}  (\./)?${tarball}$" SHASUMS256.txt > "${tarball}.sha256"; then
  {
    echo "error: no checksum entry for ${tarball} in ${base_url}/SHASUMS256.txt"
    echo "  received (first 2000 bytes):"
    head -c 2000 SHASUMS256.txt | tr -d '\r' | tr -c '[:print:]\n\t' '.' | sed 's/^/    /'
    echo
  } >&2
  exit 1
fi

sha256sum -c "${tarball}.sha256"
tar --no-same-owner --strip-components=2 -C /usr/local/bin -xzf "${tarball}" mise/bin/mise
rm "${tarball}"

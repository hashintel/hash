#!/usr/bin/env bash

# Installs the mise binary to /usr/local/bin from its GitHub release,
# verified against the release's SHASUMS256.txt.

set -euo pipefail

# renovate: datasource=github-releases depName=jdx/mise
MISE_VERSION=2026.8.10

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

# curl needs the header passed explicitly, and plain `-L` drops it on a cross-host redirect.
curl_auth=()
github_token="${MISE_GITHUB_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -n ${github_token} ]]; then
  curl_auth=(--header "Authorization: Bearer ${github_token}")
fi

# Downloads $1 to $2. `--fail` is deliberately omitted so that the response body
# survives to be printed: a bare `curl: (22)` explains nothing about why a build broke.
# `--retry-max-time` bounds the series: curl prefers a server `Retry-After`, and GitHub sends 60.
fetch() {
  local url=$1 output=$2
  local headers="${output}.headers"
  local status=000 curl_status=0

  status=$(
    curl -sS -L \
      --retry 5 --retry-all-errors --retry-delay 2 --retry-max-time 60 \
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
      echo "  curl exit code: ${curl_status}"
      echo "  http status:    ${status}"
      # `--dump-header` appends, so keep only the headers following the last status line.
      awk '
        /^[Hh][Tt][Tt][Pp]\// { count = 0; next }
        tolower($0) ~ /^(retry-after|x-ratelimit-[a-z-]+):/ { header[++count] = $0 }
        END { for (i = 1; i <= count; i++) print header[i] }
      ' "${headers}" 2> /dev/null | tr -d '\r' | sed 's/^/  /' || true
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

# Extract the entry first, so a bad response is reported as such and not as a parse failure.
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

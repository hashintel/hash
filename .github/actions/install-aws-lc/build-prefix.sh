#!/usr/bin/env bash
# Usage: build-prefix.sh <prefix> [cargo profile]
#
# Builds `aws-lc-sys` from source and lays its library, headers and bindings out as an install
# prefix, which `aws-lc-sys` links when given `AWS_LC_SYS_SYSTEM_DIR` and `AWS_LC_SYS_STATIC=1`.
set -euo pipefail

prefix=$1
profile=${2:-dev}

target_dir=$(mktemp -d)
trap 'rm -rf "$target_dir"' EXIT

# Compiling AWS-LC locally is faster than fetching each object from the remote compiler cache.
unset RUSTC_WRAPPER
while read -r name; do unset "$name"; done < <(compgen -e | grep -E '^AWS_LC_SYS_(SYSTEM_DIR|STATIC)' || true)

package=$(cargo metadata --locked --format-version 1 |
  jq --compact-output --exit-status '[.packages[] | select(.name == "aws-lc-sys")] | if length == 1 then .[0] else error("expected one aws-lc-sys package, found \(length)") end')
manifest_dir=$(dirname "$(jq --raw-output '.manifest_path' <<<"$package")")
version=$(jq --raw-output '.version' <<<"$package")

build_script=$(cargo build --locked --package aws-lc-sys --profile "$profile" --target-dir "$target_dir" --message-format json |
  jq --compact-output 'select(.reason == "build-script-executed" and (.package_id | test("aws-lc-sys")))')

out_dir=$(jq --raw-output --exit-status '.out_dir' <<<"$build_script")
library=$(jq --raw-output --exit-status '[.linked_libs[] | select(startswith("static=") and endswith("_crypto"))] | if length == 1 then .[0] | ltrimstr("static=") else error("expected one static crypto library, found \(length)") end' <<<"$build_script")

if jq --exit-status '.cfgs | index("use_bindgen_pregenerated")' <<<"$build_script" >/dev/null; then
  bindings=$out_dir/bindings.rs
else
  bindings=$(jq --raw-output --exit-status --arg src "$manifest_dir/src" '[.cfgs[] | $src + "/" + . + "_crypto.rs"]' <<<"$build_script" |
    jq --raw-output '.[]' | while read -r candidate; do [[ -f $candidate ]] && echo "$candidate"; done)
  if [[ $(wc -l <<<"$bindings") -ne 1 || -z $bindings ]]; then
    echo "::error::expected one pregenerated bindings file for the emitted cfgs, found: ${bindings:-none}"
    exit 1
  fi
fi

rm -rf "$prefix"
mkdir -p "$prefix/lib" "$prefix/share/rust"
cp "$out_dir/lib${library}.a" "$prefix/lib/libcrypto-awslc.a"
cp -R "$out_dir/include" "$prefix/include"

# `aws-lc-sys` includes these bindings inside a module that carries the same `allow` list, and an
# included file cannot start with an inner attribute.
sed '/^#!\[allow($/,/^)\]$/d' "$bindings" >"$prefix/share/rust/aws_lc_bindings.rs"
if grep --quiet '^#!' "$prefix/share/rust/aws_lc_bindings.rs"; then
  echo "::error::could not remove the inner attributes from $bindings"
  exit 1
fi

echo "$version" >"$prefix/aws-lc-sys.version"
echo "Built the AWS-LC prefix for aws-lc-sys $version at $prefix"

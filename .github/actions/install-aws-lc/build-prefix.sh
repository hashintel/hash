#!/usr/bin/env bash
# Usage: build-prefix.sh <prefix> <dev|release> <aws-lc-sys version> <aws-lc-sys checksum>
#
# Builds the AWS-LC source bundled in the `aws-lc-sys` crate with AWS-LC's own CMake build, and
# installs the static library, headers and generated Rust bindings into <prefix>, which
# `aws-lc-sys` links when `AWS_LC_SYS_SYSTEM_DIR` points at it.
set -euo pipefail

prefix=$1
profile=$2
version=$3
checksum=$4

case $profile in
  dev) build_type=Debug ;;
  release) build_type=Release ;;
  *)
    echo "::error::unknown profile \`$profile\`, expected \`dev\` or \`release\`"
    exit 1
    ;;
esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

curl --fail --silent --show-error --location --retry 3 \
  --output "$work/aws-lc-sys.crate" "https://static.crates.io/crates/aws-lc-sys/aws-lc-sys-$version.crate"
sha256sum --check --quiet <<<"$checksum  $work/aws-lc-sys.crate"
tar --extract --gzip --file "$work/aws-lc-sys.crate" --directory "$work"
crate=$work/aws-lc-sys-$version

if ! bindgen_version=$(bindgen --version 2>&1); then
  echo "::error::\`bindgen --version\` failed, \`mise install --env ci\` should provide \`bindgen-cli\`: $bindgen_version"
  exit 1
fi
echo "Using $bindgen_version from $(command -v bindgen)"

# The crate ships AWS-LC with pregenerated assembly and its symbol-prefix headers, so the build
# needs neither Go nor Perl, and keeps the prefix the crate's own bindings use.
cmake -S "$crate/aws-lc" -B "$work/build" \
  -DCMAKE_BUILD_TYPE="$build_type" \
  -DCMAKE_INSTALL_PREFIX="$prefix" \
  -DBUILD_LIBSSL=OFF \
  -DBUILD_TESTING=OFF \
  -DBUILD_TOOL=OFF \
  -DDISABLE_GO=ON \
  -DDISABLE_PERL=ON \
  -DBORINGSSL_PREFIX="aws_lc_${version//./_}" \
  -DBORINGSSL_PREFIX_HEADERS="$crate/generated-include" \
  -DGENERATE_RUST_BINDINGS=ON
cmake --build "$work/build" --parallel "$(nproc)"
cmake --install "$work/build"

echo "$version" >"$prefix/aws-lc-sys.version"
echo "::notice::Built the $profile AWS-LC prefix for aws-lc-sys $version in ${SECONDS}s"

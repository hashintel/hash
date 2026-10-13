#!/usr/bin/env bash
# Usage: build-prefix.sh <prefix> <dev|release>
#
# Builds the AWS-LC source bundled in the locked `aws-lc-sys` crate with AWS-LC's own CMake build,
# and installs the static library, headers and generated Rust bindings into <prefix>, which
# `aws-lc-sys` links when `AWS_LC_SYS_SYSTEM_DIR` points at it.
set -euo pipefail

prefix=$1
profile=$2

case $profile in
  dev) build_type=Debug ;;
  release) build_type=Release ;;
  *)
    echo "::error::unknown profile \`$profile\`, expected \`dev\` or \`release\`"
    exit 1
    ;;
esac

if ! metadata=$(cargo metadata --locked --format-version 1); then
  echo "::error::\`cargo metadata --locked\` failed"
  exit 1
fi
if ! manifest=$(jq --raw-output --exit-status '.packages[] | select(.name == "aws-lc-sys") | .manifest_path' <<<"$metadata"); then
  echo "::error::\`cargo metadata\` lists no aws-lc-sys package"
  exit 1
fi
crate=$(dirname "$manifest")
version=$(cargo pkgid --locked aws-lc-sys)
version=${version##*@}

# CMake runs bindgen outside the repository, where the mise shim cannot resolve a version.
if ! bindgen=$(mise which bindgen); then
  echo "::error::\`mise which bindgen\` failed, \`mise install --env ci\` should provide \`bindgen-cli\`"
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
rm -rf "$prefix"

# The crate ships AWS-LC with pregenerated assembly and its symbol-prefix headers, so the build
# needs neither Go nor Perl, and keeps the prefix the crate's own bindings use. The source is
# cargo's registry copy, which the build must leave unmodified.
cmake -S "$crate/aws-lc" -B "$work" \
  -DCMAKE_BUILD_TYPE="$build_type" \
  -DCMAKE_INSTALL_PREFIX="$prefix" \
  -DBUILD_LIBSSL=OFF \
  -DBUILD_TESTING=OFF \
  -DBUILD_TOOL=OFF \
  -DDISABLE_GO=ON \
  -DDISABLE_PERL=ON \
  -DENABLE_SOURCE_MODIFICATION=OFF \
  -DBORINGSSL_PREFIX="aws_lc_${version//./_}" \
  -DBORINGSSL_PREFIX_HEADERS="$crate/generated-include" \
  -DGENERATE_RUST_BINDINGS=ON \
  -DBINDGEN_EXECUTABLE="$bindgen"
cmake --build "$work" --parallel "$(nproc)"
cmake --install "$work"

echo "::notice::Built the $profile AWS-LC prefix for aws-lc-sys $version on ${ImageOS:-an unknown image} in ${SECONDS}s"

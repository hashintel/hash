#!/usr/bin/env python3
"""Validate `.config/mise/mise.lock` without network access.

Checks that the lockfile is consistent with `.config/mise/config.toml` and
internally sane. `mise` itself has no `mise lock --check` (as of 2026.7.0),
and a locked `mise install` only validates entries for the platform it runs
on, so this script covers the cross-platform failure modes:

1. Staleness: every tool pinned in `config.toml` has a lockfile entry whose
   version matches the pin.
2. Coverage: every lockfile entry that carries platform data has an entry for
   each platform developers and CI rely on (see REQUIRED_PLATFORMS).
3. Cross-platform sanity: a platform entry's download URL must not point at
   an asset built for a different architecture or operating system (e.g. a
   `darwin_amd64` asset under a `macos-arm64` key), and two different
   platforms must not share the same asset unless it is explicitly universal.

Exits non-zero on failures. Known upstream bugs can be allowlisted in
KNOWN_BAD_ENTRIES; matching findings are downgraded to warnings.
"""

from __future__ import annotations

import re
import sys
import tomllib
from pathlib import Path
from urllib.parse import urlparse

CONFIG_PATH = Path(".config/mise/config.toml")
LOCK_PATH = Path(".config/mise/mise.lock")

# Platforms that must be present for every tool that has platform data in the
# lockfile. Extra platforms (e.g. macos-x64) are validated but not required.
REQUIRED_PLATFORMS = frozenset({"linux-x64", "linux-arm64", "macos-arm64"})

# Substrings in an asset filename that contradict the platform key's
# architecture. Only unambiguous markers are listed to avoid false positives.
ARCH_CONFLICTS = {
    "x64": ("arm64", "aarch64", "aarch_64", "aarch-64", "armv6", "armv7"),
    "arm64": ("amd64", "x86_64", "x86-64", "i686", "i386"),
}

# Substrings in an asset filename that contradict the platform key's OS.
OS_CONFLICTS = {
    "linux": ("darwin", "macos", "osx", "apple", "windows", "win32", "win64", ".exe"),
    "macos": ("linux", "musl", "windows", "win32", "win64", ".exe"),
}

# Asset name markers for genuinely platform-independent artifacts, exempt
# from the duplicate-URL check.
UNIVERSAL_MARKERS = ("universal", "noarch", "any", "all")

# (tool, platform, exact URL) entries excused from cross-platform sanity
# checks. Findings on these entries are reported as warnings instead of
# failures. Remove an entry once the underlying bug is fixed and the
# lockfile has been regenerated with the correct asset.
KNOWN_BAD_ENTRIES = {
    # `mise lock` (2026.7.0) resolves the darwin_amd64 asset for yq's
    # macos-arm64 entry, mirroring the macos-x64 entry byte-for-byte, even
    # though a native yq_darwin_arm64 asset exists in the release. Found in
    # hashintel/hash#9000; reported upstream to jdx/mise. Intel-mac binaries
    # run under Rosetta 2, so this is a performance bug, not a breakage.
    (
        "yq",
        "macos-arm64",
        "https://github.com/mikefarah/yq/releases/download/v4.53.2/yq_darwin_amd64",
    ),
}

failures: list[str] = []
warnings: list[str] = []


def report(message: str, *, known_bad: bool) -> None:
    if known_bad:
        warnings.append(message)
    else:
        failures.append(message)


def is_known_bad(tool: str, platform: str, url: str | None) -> bool:
    return (tool, platform, url) in KNOWN_BAD_ENTRIES


def version_matches(pin: str, locked: str) -> bool:
    """Match the way mise resolves pins: exact, or pin as version prefix."""
    return locked == pin or locked.startswith(f"{pin}.")


def asset_name(url: str) -> str:
    return urlparse(url).path.rsplit("/", 1)[-1].lower()


def check_staleness(config: dict, lock_tools: dict) -> None:
    for tool, spec in config.get("tools", {}).items():
        pin = spec["version"] if isinstance(spec, dict) else spec
        if not isinstance(pin, str):
            continue
        entries = lock_tools.get(tool)
        if not entries:
            report(
                f"{tool}: pinned to {pin} in {CONFIG_PATH} but missing from "
                f"{LOCK_PATH} — run `mise lock` and commit the result",
                known_bad=False,
            )
            continue
        locked_versions = [e.get("version", "") for e in entries]
        if not any(version_matches(pin, v) for v in locked_versions):
            report(
                f"{tool}: pinned to {pin} in {CONFIG_PATH} but locked at "
                f"{', '.join(locked_versions)} — run `mise lock` and commit "
                f"the result",
                known_bad=False,
            )


def platform_entries(entry: dict) -> dict[str, dict]:
    """Extract `platforms.<key>` sub-tables from one lockfile tool entry."""
    result = {}
    for key, value in entry.items():
        if key.startswith("platforms.") and isinstance(value, dict):
            result[key.removeprefix("platforms.")] = value
    return result


def check_platform_coverage(tool: str, platforms: dict[str, dict]) -> None:
    missing = REQUIRED_PLATFORMS - platforms.keys()
    if missing:
        report(
            f"{tool}: lockfile is missing platform entries for "
            f"{', '.join(sorted(missing))} — run "
            f"`mise lock --platform {','.join(sorted(REQUIRED_PLATFORMS))}`",
            known_bad=False,
        )


def check_asset_sanity(tool: str, platforms: dict[str, dict]) -> None:
    for platform, info in platforms.items():
        url = info.get("url")
        if not url:
            continue
        os_key, _, arch_key = platform.partition("-")
        name = asset_name(url)
        tokens = set(re.split(r"[^a-z0-9]+", name))

        conflicts = [
            marker
            for marker in ARCH_CONFLICTS.get(arch_key, ())
            if marker in name
        ]
        # Short markers like "x64" are only checked as whole tokens since
        # they are substrings of unrelated words.
        if arch_key == "arm64" and "x64" in tokens:
            conflicts.append("x64")
        conflicts += [
            marker for marker in OS_CONFLICTS.get(os_key, ()) if marker in name
        ]
        if conflicts:
            report(
                f"{tool}: platforms.{platform} URL points at an asset for a "
                f"different platform (matched {', '.join(sorted(set(conflicts)))}): {url}",
                known_bad=is_known_bad(tool, platform, url),
            )

    # Two different platforms sharing one asset is the signature of the
    # wrong-asset bug class, unless the asset is explicitly universal.
    by_url: dict[str, list[str]] = {}
    for platform, info in sorted(platforms.items()):
        if info.get("url"):
            by_url.setdefault(info["url"], []).append(platform)
    for url, keys in by_url.items():
        if len(keys) < 2:
            continue
        if any(marker in set(re.split(r"[^a-z0-9]+", asset_name(url))) for marker in UNIVERSAL_MARKERS):
            continue
        report(
            f"{tool}: platforms {', '.join(keys)} share the same asset, "
            f"which is not marked universal: {url}",
            known_bad=any(is_known_bad(tool, key, url) for key in keys),
        )


def main() -> int:
    if not LOCK_PATH.is_file():
        print(f"{LOCK_PATH} not found — nothing to validate")
        return 0

    with CONFIG_PATH.open("rb") as f:
        config = tomllib.load(f)
    with LOCK_PATH.open("rb") as f:
        lock = tomllib.load(f)

    lock_tools: dict[str, list[dict]] = lock.get("tools", {})

    check_staleness(config, lock_tools)
    for tool, entries in lock_tools.items():
        for entry in entries:
            platforms = platform_entries(entry)
            if not platforms:
                # Backends such as cargo:/npm:/pipx: build or fetch through
                # their own package manager and carry no per-platform URLs.
                continue
            check_platform_coverage(tool, platforms)
            check_asset_sanity(tool, platforms)

    for message in warnings:
        print(f"::warning title=mise.lock (known upstream bug)::{message}")
    for message in failures:
        print(f"::error title=mise.lock::{message}")

    checked = sum(1 for entries in lock_tools.values() for e in entries)
    print(
        f"Checked {checked} lockfile entries: "
        f"{len(failures)} failure(s), {len(warnings)} known-bad warning(s)"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

"""
Usage: cache-key.py <dev|release>

Writes the locked `aws-lc-sys` version and checksum, the cache key of its AWS-LC prefix and the
prefix path as GitHub Actions step outputs.
"""

import hashlib
import os
import re
import subprocess
import sys
import tomllib

profile = sys.argv[1]
if profile not in ("dev", "release"):
    sys.exit(f"::error::unknown profile `{profile}`, expected `dev` or `release`")

with open("Cargo.lock", "rb") as lockfile:
    packages = [
        p for p in tomllib.load(lockfile)["package"] if p["name"] == "aws-lc-sys"
    ]
if len(packages) != 1:
    sys.exit(
        f"::error::expected one aws-lc-sys package in Cargo.lock, found {len(packages)}"
    )
version = packages[0]["version"]
checksum = packages[0]["checksum"]

build_environment = sorted(
    f"{name}={value}"
    for name, value in os.environ.items()
    if re.fullmatch(r"(CC|CFLAGS|ASMFLAGS|LDFLAGS|CMAKE_[A-Z_]+)", name)
)
inputs = "\n".join(
    [
        checksum,
        profile,
        os.environ["ACTION_FILES"],
        subprocess.run(
            ["cc", "--version"], check=True, capture_output=True, text=True
        ).stdout,
        subprocess.run(
            ["cmake", "--version"], check=True, capture_output=True, text=True
        ).stdout,
        *build_environment,
    ]
)
print(inputs)
digest = hashlib.sha256(inputs.encode()).hexdigest()[:16]

with open(os.environ["GITHUB_OUTPUT"], "a") as output:
    print(f"version={version}", file=output)
    print(f"checksum={checksum}", file=output)
    print(
        f"key=aws-lc-sys-{version}-{os.environ['RUNNER_OS']}-{os.environ['RUNNER_ARCH']}-{profile}-{digest}",
        file=output,
    )
    print(f"prefix={os.environ['RUNNER_TEMP']}/aws-lc-{profile}", file=output)

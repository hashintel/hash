"""
Setup script for the Rust GitHub Actions.

The output of this will be used as arguments for the GitHub Actions matrix.

see: https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs
"""

import re
import json
import itertools
import toml

from fnmatch import fnmatch
from pathlib import Path
from pygit2 import Repository, Commit

CWD = Path.cwd()

# All jobs for all crates will run if any of these paths change
ALWAYS_RUN_PATTERNS = ["**/rust-toolchain.toml", ".github/**"]

# Toolchains used for the specified crates in addition to the toolchain which is defined in
# rust-toolchain.toml
TOOLCHAINS = {
    "packages/libs/error-stack": ["1.61"],
}

# Try and publish these crates when their version is changed in Cargo.toml
PUBLISH_PATTERNS = ["packages/libs/error-stack"]


def generate_diffs():
    """
    Generates a diff between `HEAD^` and `HEAD`
    """

    repository = Repository(CWD)
    head = repository.head.peel(Commit)
    return repository.diff(head.parents[0], head, context_lines=0)


def find_local_crates():
    """
    Returns all available crates in the workspace.

    If a crate is in a sub-crate of another crate, only the super-crate will be returned because
    `cargo-make` will run the sub-crate automatically.
    :return: a list of crate paths
    """
    all_crates = [path.relative_to(CWD).parent for path in CWD.rglob("Cargo.toml")]
    checked_crates = []
    for crate in all_crates:
        if not any(path in crate.parents for path in all_crates):
            checked_crates.append(crate)
    return checked_crates


def filter_for_changed_crates(diffs, crates):
    """
    Returns a list of paths to crates which have changed files

    If a file was changed, which matches `ALWAYS_RUN_PATTERNS`, all crates will be returned
    :param diffs: a list `Diff`s returned from git
    :param crates: a list of paths to crates
    :return: a list of crate paths
    """
    # Check if any changed file matches `ALWAYS_RUN_PATTERNS`
    if any(
        fnmatch(diff.delta.new_file.path, pattern)
        for diff in diffs
        for pattern in ALWAYS_RUN_PATTERNS
    ):
        return crates

    # Get the unique crate paths which have changed files
    return list(
        {
            crate
            for crate in crates
            for diff in diffs
            if fnmatch(diff.delta.new_file.path, f"{crate}/**")
        }
    )


def filter_crates_by_changed_version(diffs, crates):
    """
    Returns the crates whose version has changed
    :param diffs: a list of `Diff`s returned from git
    :param crates: a list of paths to crates
    :return: a list of crate paths
    """

    def crate_version_changed(crate, diff):
        if crate / "Cargo.toml" != Path(diff.delta.new_file.path):
            return False

        for hunk in diff.hunks:
            for line in hunk.lines:
                for content in line.content.splitlines():
                    if re.fullmatch('version\\s*=\\s*".*"', content):
                        return True
        return False

    return [
        crate
        for diff in diffs
        for crate in crates
        if crate_version_changed(crate, diff)
    ]


def filter_for_publishable_crates(crates):
    """
    Returns the crates which are allowed to be published
    :param crates: a list of paths to crates
    :return: a list of crate paths which are allowed to be published
    """
    return [
        crate
        for crate in crates
        for pattern in PUBLISH_PATTERNS
        if fnmatch(crate, pattern)
    ]


def output_matrix(name, crates, **kwargs):
    """
    Outputs the job matrix for the given crates
    :param name: The name where the list of crates will be stored to be read by GitHub Actions
    :param crates: a list of paths to crates
    """

    available_toolchains = []
    for crate in crates:
        with open(
            crate / "rust-toolchain.toml", "r", encoding="UTF-8"
        ) as toolchain_toml:
            available_toolchains.append(
                toml.loads(toolchain_toml.read())["toolchain"]["channel"]
            )
        for pattern, additional_toolchains in TOOLCHAINS.items():
            for additional_toolchain in additional_toolchains:
                available_toolchains.append(additional_toolchain)

    used_toolchain_combinations = []
    for crate in crates:
        toolchains = []
        with open(
            crate / "rust-toolchain.toml", "r", encoding="UTF-8"
        ) as toolchain_toml:
            toolchains.append(toml.loads(toolchain_toml.read())["toolchain"]["channel"])

        # We only run the default toolchain on lint/publish (rust-toolchain.toml)
        if name not in ("lint", "publish"):
            for pattern, additional_toolchains in TOOLCHAINS.items():
                if fnmatch(crate, pattern):
                    toolchains += additional_toolchains
        used_toolchain_combinations.append(
            itertools.product([crate], toolchains, repeat=1)
        )

    available_toolchain_combinations = itertools.product(crates, available_toolchains)
    excluded_toolchain_combinations = set(available_toolchain_combinations).difference(
        *used_toolchain_combinations
    )

    matrix = dict(
        directory=[str(crate) for crate in crates],
        toolchain=available_toolchains,
        **kwargs,
        exclude=[
            dict(directory=str(elem[0]), toolchain=elem[1])
            for elem in excluded_toolchain_combinations
        ],
    )
    if len(matrix["directory"]) == 0:
        matrix = {}

    print(f"::set-output name={name}::{json.dumps(matrix)}")
    print(f"Job matrix for {name}: {json.dumps(matrix, indent=4)}")


def main():
    diffs = generate_diffs()
    available_crates = find_local_crates()
    changed_crates = list(set(filter_for_changed_crates(diffs, available_crates)))

    output_matrix("lint", changed_crates)
    output_matrix("test", changed_crates, profile=["development", "production"])
    output_matrix(
        "publish",
        filter_crates_by_changed_version(
            diffs, filter_for_publishable_crates(changed_crates)
        ),
        profile=["release"],
    )


if __name__ == "__main__":
    main()

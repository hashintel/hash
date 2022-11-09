"""
Setup script for the Rust GitHub Actions.

The output of this will be used as arguments for the GitHub Actions matrix.

see: https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs
"""

import re
import json
import itertools
import os
import toml

from fnmatch import fnmatch
from pathlib import Path
from pygit2 import Repository, Commit

CWD = Path.cwd()

# All jobs for all crates will run if any of these paths change
ALWAYS_RUN_PATTERNS = [".github/**"]

# Toolchains used for the specified crates in addition to the toolchain which is defined in
# rust-toolchain.toml
TOOLCHAINS = {
    "packages/libs/error-stack": ["1.63", "1.65"],
    "packages/libs/deer": ["1.65"]
}

# Try and publish these crates when their version is changed in Cargo.toml
PUBLISH_PATTERNS = ["packages/libs/error-stack**"]
# deer is disabled for now because we don't want to publish it just yet
# "packages/libs/deer**"

# Build a docker container for these crates
DOCKER_PATTERNS = ["packages/graph/hash_graph"]

# Build a coverage report for these crates
COVERAGE_PATTERNS = ["packages/graph/**", "packages/libs/**"]


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


def filter_parent_crates(crates):
    checked_crates = []
    for crate in crates:
        if not any(path in crate.parents for path in crates):
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


def filter_for_coverage_crates(crates):
    """
    Returns the crates for which a coverage report will be created
    :param crates: a list of paths to crates
    :return: a list of crate paths which are allowed to be published
    """
    return [
        crate
        for crate in crates
        for pattern in COVERAGE_PATTERNS
        if fnmatch(crate, pattern)
    ]


def filter_for_docker_crates(crates):
    """
    Returns the crates for which docker containers are built
    :param crates: a list of paths to crates
    :return: a list of crate paths for which docker containers are built
    """
    return [
        crate
        for crate in crates
        for pattern in DOCKER_PATTERNS
        if fnmatch(crate, pattern)
    ]


def output_matrix(name, github_output_file, crates, **kwargs):
    """
    Outputs the job matrix for the given crates
    :param name: The name where the list of crates will be stored to be read by GitHub Actions
    :param crates: a list of paths to crates
    """

    available_toolchains = set()
    for crate in crates:
        with open(
            crate / "rust-toolchain.toml", "r", encoding="UTF-8"
        ) as toolchain_toml:
            available_toolchains.add(
                toml.loads(toolchain_toml.read())["toolchain"]["channel"]
            )
        for pattern, additional_toolchains in TOOLCHAINS.items():
            for additional_toolchain in additional_toolchains:
                available_toolchains.add(additional_toolchain)

    used_toolchain_combinations = []
    for crate in crates:
        toolchains = []
        with open(
            crate / "rust-toolchain.toml", "r", encoding="UTF-8"
        ) as toolchain_toml:
            toolchains.append(toml.loads(toolchain_toml.read())["toolchain"]["channel"])

        # We only run the default toolchain on coverage/lint/publish (rust-toolchain.toml)
        if name not in ("coverage", "lint", "publish"):
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
        name=[crate.name.replace("_", "-") for crate in crates],
        toolchain=list(available_toolchains),
        **kwargs,
        exclude=[
            dict(name=elem[0].name.replace("_", "-"), toolchain=elem[1])
            for elem in excluded_toolchain_combinations
        ],
        include=[
            dict(name=crate.name.replace("_", "-"), directory=str(crate))
            for crate in crates
        ],
    )
            
    if len(matrix["name"]) == 0:
        matrix = {}

    github_output_file.write(f"{name}={json.dumps(matrix)}\n")
    print(f"Job matrix for {name}: {json.dumps(matrix, indent=4)}")


def main():
    diffs = generate_diffs()
    available_crates = find_local_crates()
    changed_crates = filter_for_changed_crates(diffs, available_crates)
    changed_parent_crates = filter_parent_crates(changed_crates)
    coverage_crates = filter_for_coverage_crates(changed_parent_crates)
    changed_docker_crates = filter_for_docker_crates(changed_parent_crates)

    github_output_file = open(os.environ["GITHUB_OUTPUT_FILE_PATH"], "w")

    output_matrix("lint", github_output_file, changed_parent_crates)
    output_matrix("test", github_output_file, changed_parent_crates, profile=["development", "production"])
    output_matrix("coverage", github_output_file, coverage_crates)
    output_matrix("docker", github_output_file, changed_docker_crates, profile=["production"])
    output_matrix(
        "publish",
        github_output_file,
        filter_crates_by_changed_version(
            diffs, filter_for_publishable_crates(changed_crates)
        ),
        profile=["release"],
    )

    github_output_file.close()


if __name__ == "__main__":
    main()

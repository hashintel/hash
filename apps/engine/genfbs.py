#! /usr/bin/env python3
"""
Runs flatc on the flatbuffer definition files, generating Rust & Python files.
Saves Rust files to apps/engine/src/gen.
Saves Python files to apps/engine/runner/py/fbs.

Example:
    cd apps/engine
    python3 genfbs.py
"""
import os
import os.path
import subprocess
import re
import tempfile
import argparse
from pathlib import Path

DIR = Path(os.path.dirname(os.path.abspath(__file__)))
FORMAT_DIR = DIR.joinpath(".", "format")
RUST_TARGET_DIR = DIR.joinpath(".", "lib", "flatbuffers_gen", "src")
PYTHON_TARGET_DIR = DIR.joinpath(".", "src", "worker", "runner", "python", "fbs")

RUST_HEADER = """#![allow(
    clippy::module_name_repetitions,
    clippy::must_use_candidate,
    clippy::cast_sign_loss,
    clippy::empty_enum,
    clippy::used_underscore_binding,
    clippy::redundant_static_lifetimes,
    clippy::redundant_field_names,

    unused_imports
)]
"""

def process_rust_file(filename, target_dir):
    with open(filename) as f:
        contents = f.read()

    # Fixes imports. Example:
    # use crate::batch_generated::*;  -->  use super::batch::*;
    new_contents = re.sub(r"crate::(\w+)_generated", r"super::\1_generated", contents)

    with open(filename, "w") as f:
        f.write(RUST_HEADER)
        f.write(new_contents)
    
    new_filepath = os.path.join(target_dir, filename)
    os.rename(filename, new_filepath)
    print("Generated", os.path.realpath(new_filepath))


def rust(target_dir):
    os.chdir(FORMAT_DIR)

    with tempfile.TemporaryDirectory() as tmpdir:
        flatbuffers = [name for name in os.listdir() if name.endswith(".fbs")]
        subprocess.run(["flatc", "-o", tmpdir, "--rust"] + flatbuffers, check=True)

        os.chdir(tmpdir)

        rust_files = [name for name in os.listdir() if name.endswith(".rs")]

        subprocess.run(["rustfmt"] + rust_files, check=True)

        for name in rust_files:
            process_rust_file(name, target_dir)


def python(target_dir):
    os.chdir(FORMAT_DIR)

    with tempfile.TemporaryDirectory() as tmpdir:
        flatbuffers = [name for name in os.listdir() if name.endswith(".fbs")]
        try:
            subprocess.run(
                ["flatc", "-o", tmpdir, "--python"] + flatbuffers,
                check=True,
                capture_output=True
            )
        except subprocess.CalledProcessError as e:
            print(f"flatc failed to generate Python: code {e.returncode}\nOutput: {e.output}")
            raise e

        os.chdir(tmpdir)
        python_files = [name for name in os.listdir() if name.endswith(".py")]
        for name in python_files:
            new_filepath = os.path.join(target_dir, name)
            os.rename(name, new_filepath)
            print("Generated", os.path.realpath(new_filepath))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--python-only", default=False, action="store_true")
    parser.add_argument("--rust-only", default=False, action="store_true")
    parser.add_argument("--output-dir", help="override the where the files are placed")
    args = parser.parse_args()

    rust_dir = args.output_dir if args.output_dir else RUST_TARGET_DIR
    python_dir = args.output_dir if args.output_dir else PYTHON_TARGET_DIR

    if args.python_only:
        python(python_dir)
    elif args.rust_only:
        rust(rust_dir)
    else:
        python(python_dir)
        rust(rust_dir)


if __name__ == "__main__":
    main()

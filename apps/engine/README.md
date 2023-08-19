<p align="center">
  <img src="https://cdn-us1.hash.ai/assets/hengine-github-readme-header%402x.png">
</p>
<div align="center">
 <a href="https://github.com/hashintel/hash/blob/main/apps/engine/LICENSE.md"><img src="https://cdn-us1.hash.ai/assets/license-badge-elastic.svg" alt="Elastic License v2" /></a>
 <a href="https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_hash-repo_engine"><img src="https://img.shields.io/discord/840573247803097118" alt="Join HASH on Discord" /></a>
</div>

# HASH Engine

[HASH Engine](https://hash.ai/platform/engine?utm_medium=organic&utm_source=github_readme_engine) (**hEngine**) is the computational simulation engine at the heart of [HASH](https://hash.ai/simulations?utm_medium=organic&utm_source=github_readme_engine). It is publicly and freely available here under the Elastic License.

This public version of hEngine is our 'alpha' engine whose architecture and performance characteristics differ significantly to the stable engine powering [hCore](https://hash.ai/platform/core?utm_medium=organic&utm_source=github_readme_engine), our in-browser simulation envrionment; and [hCloud](https://hash.ai/platform/cloud?utm_medium=organic&utm_source=github_readme_engine), our cloud simulation compute service. It is not yet stable.

Our ultimate intention is to migrate both hCore and hCloud to use the engine under development here (upon its first stable release).

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Issue Tracking](#issue-tracking)
- [Additional Documentation](#additional-documentation)
- [Questions & Support](#questions--support)
- [The State of Development](#the-state-of-development)
- [Building and Testing](#building-and-testing)
  - [Required dependencies](#required-dependencies)
  - [Optional dependencies](#optional-dependencies)
  - [macOS Developer Specific Instructions](#macos-developer-specific-instructions)
  - [Possible Dependencies and Debugging](#possible-dependencies-and-debugging)
  - [Project Setup / Building](#project-setup--building)
  - [Running for development](#running-for-development)
- [Quick Start Guide](#quick-start-guide)
- [Usage](#usage)
  - [CLI Arguments and Options](#cli-arguments-and-options)
  - [Run a simulation](#run-a-simulation)
  - [Simulation Inputs](#simulation-inputs)
  - [Simulation Outputs](#simulation-outputs)
  - [Logging](#logging)
- [Main Concepts](#main-concepts)
- [The Project Layout](#the-project-layout)
  - [The CLI](#the-cli)
  - [The Engine Process(es)](#the-engine-processes)
- [Contributors](#contributors)

## Issue Tracking

We use [GitHub Issues](https://github.com/hashintel/hash/issues) to help prioritize and track bugs and feature requests. Please use the [HASH Engine Issue form](https://github.com/hashintel/hash/issues/new?assignees=&labels=A-engine%2CC-bug&template=bug-report-hash-engine.yml) to help us deal with your report most effectively. If you're unsure about something or need help, you can also ask questions and get support on our public [Discord server](https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_engine).

## Additional Documentation

Our [user guide for simulation](https://hash.ai/docs/simulation?utm_medium=organic&utm_source=github_readme_engine) contains a beginner's introduction as well as in-depth tutorials for **hCore** today.

The [HASH glossary](https://hash.ai/glossary?utm_medium=organic&utm_source=github_readme_engine) contains helpful explainers around key modeling, simulation and AI-related terms and concepts.

## Questions & Support

We're building a community of people who care about enabling better decision-making through modeling and simulation. Our [support forum](https://hash.community/?utm_medium=organic&utm_source=github_readme_engine) and [HASH community Discord server](https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_engine) (requires login) are both great places to meet other modelers and get help.

## The State of Development

As outlined above, this project is the next-generation of our simulation engine, and differs from the one currently powering [hCore](https://hash.ai/platform/core?utm_medium=organic&utm_source=github_readme_engine) and [hCloud](https://hash.ai/platform/cloud?utm_medium=organic&utm_source=github_readme_engine). It's published here as a pre-release technology preview, and as such the feature-set and codebase should be considered unstable until it's released. That means that there are a number of features you may use on the HASH platform that at present may not be supported by this project, notably:

- Rust runners, and therefore **Rust behaviors** (which are generally a subset of the @hash behaviors found within hIndex) are currently **disabled**. This is a high-priority item for us and will be one of the main items of development focused on in the near future. A large part of the implementation is finished and can be found in this repository, if you are interested in exploring it (Although as it is _not_ completely finished, expect to find bugs).

There are a number of other functionalities in the HASH platform that are possibly under-development and/or not stable within the current repository. Feel free to try things out, but don't be dissuaded if they don't work yet. We don't want to make any guarantees until we've had time to properly test features, and for now we're prioritising development to get those features out!

- For now, running of simulations should be easiest with _'single runs'_. (More in-depth usage documentation is found below in [Running for development](#running-for-development)) Various Experiment types have not been fully tested at the moment, and documentation and support may be lacking.
- Analysis views are also untested at the moment and thus presently are not considered stable or supported.

## Building and Testing

> The following section assumes execution of commands are from within this directory (i.e. [/apps/engine](/apps/engine) relative to the repository root). As such, paths are relative to the folder this README is in.

Depending on your needs, different dependencies are required. Building this project requires the following.

### Required dependencies

- The Rust Compiler

  - We recommend installing and using rustup, following the [instructions on the Rust-Lang website](https://www.rust-lang.org/tools/install)
  - hEngine runs on the Nightly toolchain. The version is managed by the [rust-toolchain.toml](./rust-toolchain.toml) file. To verify, run `rustup show` from the [engine](.) directory.

- CMake [3.X.X >= 3.21.2]

  - CMake installation guidance from the [CMake page](https://cmake.org/install/) or if on macOS through [brew](https://brew.sh/)

- a C++ compiler, pkg-config, openssl development files (see [Possible Dependencies and Debugging](#possible-dependencies-and-debugging))

- Please also see [macOS Developer Specific Instructions](#macos-developer-specific-instructions) if you are running macOS

### Optional dependencies

- Flatbuffers [2.0.0] is required to generate structs in Javascript, Python, or Rust for messaging between processes in hCloud. Unless the schema files in [./format](./format) are changed (and thus require generation to be rerun), flatc is not needed.

  - Flatbuffers installation guidance from [their website](https://google.github.io/flatbuffers/flatbuffers_guide_building.html)

    - It's necessary to match the version (2.0.0) with the Rust crate, so build (or otherwise acquire a compiled flatc binary of) the commit associated with the [2.0.0 release](https://github.com/google/flatbuffers/releases/tag/v2.0.0)

      - One way of checking out the right commit is running the following from within the flatbuffers repository:

        ```shell
        latestTag=$(git describe --tags $(git rev-list --tags --max-count=1))
        git checkout $latestTag
        ```

- Python [3.x >= 3.8] is required for Python initialization or Python behaviors. We strongly recommend using Python 3.10, as this is the version which we presently test hEngine against.

  - Python installation can be found on [the Python website](https://www.python.org/downloads/)

### macOS Developer Specific Instructions

Unfortunately, Apple currently doesn't provide a way to resize shared-memory allocations. To work around this, allocations need to be sufficiently big such that they will not need to be resized. This can be done by setting the `OS_MEMORY_ALLOC_OVERRIDE` environment variable. A reasonable starting value might be `250000000`, but it is heavily dependent on the memory-requirements of your simulation. This can be done using the command line

```sh
export OS_MEMORY_ALLOC_OVERRIDE=250000000
```

If you want to run Python behaviors, you will need a copy of the open basic linear algebra subroutines (`brew install openblas` - if you do not have Homebrew installed, this is easily done from [its website](https://brew.sh)) - this is currently necessary to install `scipy`. You may also need to install a Fortran compiler (`brew install gfortran`).

### Possible Dependencies and Debugging

Depending on how lightweight your OS install is, you may be missing some low level dependencies, so try the following (examples given for Ubuntu/Debian-based Unix systems):

- `apt-get install build-essentials` - Includes the GCC/g++ compilers, libraries, and some other utilities
- `apt-get install pkg-config` - A helper tool used when compiling applications and libraries
- `apt-get install libssl-dev` - A development package of OpenSSL
- `apt-get install python3-dev` - A collection of developer utilities for Python such as header files (e.g. needed when seeing `fatal error: Python.h: No such file or directory`)

### Project Setup / Building

- Run `cargo build`
- **optional:** If Python initialization or Python behaviors are used, set up a Python environment by running `./lib/execution/src/runner/python/setup.sh` and follow the instructions from the help.

### Running for development

> **WIP** - This section is a work-in-progress. However, slightly more detailed documentation of the CLI is provided below in [CLI Arguments and Options](#cli-arguments-and-options).

The CLI binary handles parsing a HASH project, and the lifetime of the engine for an experiment. To use it requires a HASH project to be accessible on the local disk. Follow instructions in the [Run a simulation](#run-a-simulation) section to learn how to download and create one.

Then, run the CLI using:

```shell
cargo run --bin cli -- $CLI_ARGS
```

Where CLI args are described below in the [Usage](#usage) section, an example of a run command during development would be:

```shell
cargo run --bin cli -- $CLI_ARGS -p "<PATH TO HASH PROJECT DIR>" single-run --num-steps $NUM_STEPS
```

## Quick Start Guide

This guide will walk you through downloading a [demo simulation], running it, and then finding and verifying its output.

In order to run the demo:

<!-- markdownlint-disable ol-prefix -->

0.  Build the engine as [described above](#project-setup--building)
1.  Open the [demo simulation] and optionally read the overview
2.  Press `Open` at the upper right to view the simulation in [hCore].
3.  Download it by pressing `File -> Export Project`
4.  Unzip it either with your file browser or by e.g. `unzip ageing-agents.zip -d path/to/ageing-agents`
5.  Run the simulation from the _apps/engine_ directory and pass the path to the downloaded project as a parameter:

    ```shell
    cargo run --bin cli -- --project 'path/to/ageing-agents' single-run --num-steps 5
    ```

<!-- markdownlint-enable ol-prefix -->

After a short time, the simulation should complete and the process will end. Once this is done, an `./output` folder should have been created. Within that, a directory is created for each combination of [project/experiment_name/experiment_uuid/simulation_run]. For a deeper explanation of the output, please take a look at [Simulation Outputs](#simulation-outputs).

The ageing simulation increases the age of each agent by one every step. Looking in the _json_state.json_ file, one can see the outputted JSON state has an `"age"` field for each agent. It should be apparent that the age is increasing with each snapshot of state.

**Congratulations!** 🎉 , you just ran your first simulation with the hEngine!

[demo simulation]: https://core.hash.ai/@hash/ageing-agents?utm_medium=organic&utm_source=github_readme_engine

## Usage

> **WIP** - This section is a work-in-progress. Guidance on production usage will appear here.

### CLI Arguments and Options

> **WIP** - CLI arguments are unstable, their presence do not guarantee their usability. It's recommended to stick to single-runs while the project stabilises.

The CLI comes with a short help page: `cli help` or `cli -h`. A more detailed explanation about the parameters are available at the long help page with `cli --help`. To show the help page for subcommands, either append them to the command: `cli help single-run`, or use `-h`/`--help` after the subcommand: `cli single-run --help`.

If one of the environment variables shown in the help page is passed, it will overwrite the default values. Parameters take precedence over environment variables.

### Run a simulation

> **Warning** - Rust runners are currently not supported. Within your simulation project, you should only see `.js` files within dependencies (for example, dependencies/@hash/age/src/behaviors/age.js). Files ending in `.rs` will be ignored and the run will possibly fail in unclear ways.
>
> Currently, the easiest way to create a project is by using [HASH Core](https://core.hash.ai). In the future, an in-depth description of the expected project structure will be given here instead.

In order to download and run a simulation from HASH Core, use `File -> Export Project` (this is available in the toolbar at the top of the page). For help in finding or creating, and editing, simulations in HASH Core, take a look at our [online documentation][docs]. Then save and unzip the downloaded project to a location of your choice, for example by

```shell
unzip my-project.zip -d my-hash-project
```

To run the simulation, [build the binaries](#project-setup--building) and pass the project location as a CLI argument:

```shell
cargo run --bin cli -- --project /path/to/my-hash-project single-run --num-steps $NUM_STEPS
```

In order to see more logging information while the simulation is running, you can modify the [Rust logging level](https://docs.rs/log/latest/log/enum.Level.html) by exporting `RUST_LOG` before running, e.g.:

```shell
export RUST_LOG=debug
```

If your simulation requires a lot of memory and uses JavaScript behaviors, the JavaScript runner may run out of memory.
As a first step, you can provide a larger heap size to the runner:

```shell
cargo run --bin cli -- --js-runner-max-heap-size $NEW_SIZE_IN_MB $CLI_ARGS
```

This will increase the heap size, but you may still run into limitations beyond 4GB.
The next step is to recompile V8, the underlying JavaScript engine, and set flags for it:

```shell
export V8_FROM_SOURCE = "1"
export GN_ARGS = "v8_enable_pointer_compression=false v8_enable_shared_ro_heap=true"
```

- `V8_FROM_SOURCE` will force the V8 engine to be compiled from source and not use a pre-compiled version.
  This will take quite a long time (expect at least 15 minutes). This can be mitigated in subsequent compiles by using [sccache](https://github.com/mozilla/sccache) or [ccache](https://ccache.dev/). Our build scripts will detect and use them. Set the environment variable `$SCCACHE` or `$CCACHE` if the binary is not in your `$PATH`.
- `v8_enable_pointer_compression` is an optimization reducing RAM usage but limits the heap size to 4 gigabytes.
- `v8_enable_shared_ro_heap` enables read-only memory sharing by V8 isolates. This means, that read-only memory may be shared across different workers for JavaScript. Enabling this is required to compile V8 without pointer compression.

[docs]: https://hash.ai/docs/simulation?utm_medium=organic&utm_source=github_readme_engine

### Simulation Inputs

> **WIP** - This section is a work-in-progress. More in-depth documentation is in the works for describing all input formats and options, and expected project structure. For now, we recommend that you create your simulations within [hCore] and use the "Export Project" functionality.

#### Behavior keys

Behavior keys define the fields, and their respective **data type**, that a behavior accesses on an agent's state. See the [docs](https://hash.ai/docs/simulation/creating-simulations/behaviors/behavior-keys?utm_medium=organic&utm_source=github_readme_engine) for an explanation of behavior keys in general.

If you haven't created and exported a project from [hCore], it's also possible to manually create the file that specifies the behaviors keys. Generally, every user-defined variable on state (i.e. a behavior key) requires it to be specified within the accompanying `.json` file. The top level JSON object has up to three members, `"keys"`, `"built_in_key_use"`, and `"dynamic_access"`, while the latter two are neither required, nor used currently:

```json
{
  "keys": {},
  "built_in_key_use": null,
  "dynamic_access": true
}
```

> Note: JSON Objects have fields/members specified by [key]/[value] pairs. To avoid confusion between behavior _keys_ and the _keys_ in JSON Objects, we will be referring to the pairs as members or fields.

`"keys"` is a JSON object where each [key]/[value] pair is [behavior key name]/[behavior key specification]. The behavior key specification is a JSON object with at least two required members, `"type"` and `"nullable"`. Depending on `"type"` other members may be required. We support the following `"type"` values:

- **`"any"`**: Can be any datatype (when performance becomes a concern, a specific data-type should be preferred)
- **`"number"`**: A 64 bit floating point number
- **`"string"`**: The encoding depends on the language used for the behavior
- **`"boolean"`**: Either `true` or `false`
- **`"struct"`**: A nested object, which then additionally requires adding a new member called `"fields"` with the same schema as the top-level `"keys"`. Example:

  ```json
  {
    "keys": {
      "struct_field": {
        "nullable": true,
        "type": "struct",
        "fields": {
          "field1": {
            "type": "number",
            "nullable": true
          },
          "field2": {
            "type": "number",
            "nullable": true
          }
        }
      }
    }
  }
  ```

- **`"list"`**: an array with an arbitrary number of sub-elements of the same type, which then have to be specified with the addition of another member called `"child"`:

  ```json
  {
    "keys": {
      "list_field": {
        "nullable": true,
        "type": "list",
        "child": {
          "type": "string",
          "nullable": true
        }
      }
    }
  }
  ```

- **`"fixed-size-list"`**: an array with exactly `"length"` number of sub-elements of the same type, which then have to be specified with the addition of another member called `"child"`:

  ```json
  {
    "keys": {
      "fixed_size_list_field": {
        "nullable": true,
        "type": "fixed_size_list",
        "length": 4,
        "child": {
          "type": "boolean",
          "nullable": true
        }
      }
    }
  }
  ```

### Simulation Outputs

> **WIP** - This section is a work-in-progress. More in-depth documentation is in the works for describing all output formats and options. As such some functionality may not be mentioned here, and some functionality alluded to here might not be complete at present. Currently, the engine has two main form of outputs, one coming from the [json_state package](./lib/execution/src/package/simulation/output/json_state) and the other from the [analysis package](./lib/execution/src/package/simulation/output/analysis).

At the end of each simulation run, various outputs appear within the `./<OUTPUT FOLDER>/<PROJECT NAME>/<EXPERIMENT NAME>/<EXPERIMENT ID>/<SIMULATION ID>` directories.

Where:

- `<PROJECT NAME>` is the name of the folder containing your experiments
- `<EXPERIMENT ID>` and `<SIMULATION ID>` are unique identifiers created for each run of an experiment or simulation.

There is an override ([CLI Arguments and Options](#cli-arguments-and-options)) for the default of the output folder.

#### JSON-State [`json_state.json`]

> Better documentation describing the structure of the file is planned

By default, the engine outputs a serialized snapshot of Agent state every step.

During the run, the output may be buffered into the `./parts` folder in multiple files. These files are not necessarily valid JSON as the resultant state blob that appears within `json_state.json` is split up (hence `part`) for buffering purposes.

#### Analysis [`analysis_outputs.json`]

> **WIP** - This feature is currently unstable

[hCore] currently provides functionality where simulations can apply custom analysis on user-defined metrics. The functionality has been ported across to this codebase in the [analysis package](./lib/execution/src/package/simulation/output/analysis), however development is planned to stabilise it. As such, this functionality is neither tested, nor considered supported.

### Logging

The engine (and CLI) currently logs to both stderr, and to the `./log` directory. The latter is machine-parseable JSON-formatted structured logging, while the stderr logs are configurable through the command-line arguments of both binaries (see [CLI Arguments and Options](#cli-arguments-and-options)).

## Main Concepts

Being familiar with running experiments and simulations on the HASH platform will help a lot with understanding the Engine. The [docs](https://hash.ai/docs/simulation/?utm_medium=organic&utm_source=github_readme_engine) are also a good place to search for clarification on some terms used below when unclear.

## The Project Layout

Currently the hEngine consists of two binaries located within the [`./bin`](bin) folder.
To read the documentation for the various components, run:

```sh
cargo doc --workspace --no-deps --open
```

and explore the documentation for the relevant crates (starting with the following two)

### The CLI

Located within [`./bin/cli`](bin/cli), the CLI binary is responsible for the orchestration of a HASH simulation project, handling the management of engine processes for its experiments.

### The Engine Process(es)

Located within [`./bin/hash_engine`](bin/hash_engine), the HASH Engine binary implements all of the logic required for running a single experiment and its one or more simulations.

## Contributors

hEngine is under active development. Its primary contributors are:

- [Tim Diekmann](https://hash.ai/@timdiekmann) - HASH
- [Alfie Mountfield](https://hash.ai/@alfie) - HASH

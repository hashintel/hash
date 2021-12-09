> **Notice**: This branch is currently a _work-in-progress_ and as such this documentation is subject to heavy change. Clarifications and improvements will be coming in the near future, however in the mean-time a high-level explanation of the main concepts is provided below to guide understanding of the source-code and project structure. 
> 
>**An updated README including setup and usage instructions will follow shortly.**

<p align="center">
  <img src="https://cdn-us1.hash.ai/assets/hengine-github-readme-header%402x.png">
</p>
<div align="center">
 <a href="https://github.com/hashintel/engine/blob/master/LICENSE.md"><img src="https://cdn-us1.hash.ai/assets/license-badge-sspl.svg" alt="Server Side Public License" /></a>
 <a href="https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_engine"><img src="https://img.shields.io/discord/840573247803097118" alt="Join HASH on Discord" /></a>
</div>

# hEngine
[HASH Engine](https://hash.ai/platform/engine?utm_medium=organic&utm_source=github_readme_engine) (or **hEngine**) is the computational simulation engine at the heart of [HASH](https://hash.ai/platform?utm_medium=organic&utm_source=github_readme_engine) published under the terms of the Server-Side Public License (based on GPLv3, and created by MongoDB). The version currently released here contains several notable differences to the hosted version powering [hCore](https://hash.ai/platform/core?utm_medium=organic&utm_source=github_readme_engine) and [hCloud](https://hash.ai/platform/cloud?utm_medium=organic&utm_source=github_readme_engine).

## Table of Contents
- [Issue Tracking](#issue-tracking)
- [Additional Documentation](#additional-documentation)
- [Questions & Support](#questions--support)
- [Building and Testing](#building-and-testing)
  * [Dependencies](#dependencies)
  * [macOS Developer Specific Instructions](#macos-developer-specific-instructions)
    + [For Intel Macs](#for-intel-macs)
    + [For ARM-Based Macs](#for-arm-based-macs)
  * [Possible Dependencies and Debugging](#possible-dependencies-and-debugging)
  * [Project Setup / Building](#project-setup--building)
  * [Running for development](#running-for-development)
- [Usage](#usage)
- [Main Concepts](#main-concepts)
  * [High-level Overview](#high-level-overview)
    + [Starting an Experiment / the CLI](#starting-an-experiment--the-cli)
    + [Workers](#workers)
    + [Simulation Runs and the Package System](#simulation-runs-and-the-package-system)
    + [DataStore](#datastore)

## Issue Tracking
We use [GitHub Issues](https://github.com/hashintel/engine/issues) to help prioritize and track bugs and feature requests for HASH. This includes hEngine, as well as our **hCore** IDE, and the [**HASH.ai site**](https://hash.ai/platform/index?utm_medium=organic&utm_source=github_readme_engine). You can also report issues and get support on our public [Discord server](https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_engine). Please submit any issues you encounter.

## Additional Documentation
Our [simulation docs](https://hash.ai/docs/simulation?utm_medium=organic&utm_source=github_readme_engine) contain beginner guides and in-depth tutorials for **hCore** today.

The [HASH glossary](https://hash.ai/glossary?utm_medium=organic&utm_source=github_readme_engine) contains helpful explainers around key modeling, simulation and AI-related terms and concepts.

## Questions & Support
We're building a community of people who care about enabling better decision-making through modeling and simulation. Our [support forum](https://hash.community/?utm_medium=organic&utm_source=github_readme_engine) and [HASH community Discord server](https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_engine) (requires login) are both great places to meet other modelers and get help.

## Building and Testing

### Dependencies
Building this project requires the following:
* The Rust Compiler
  * We recommend installing and using rustup, following the [instructions on the Rust-Lang website](https://www.rust-lang.org/tools/install)
  * hEngine runs on the Nightly toolchain. The version is managed by the [rust-toolchain.toml](./rust-toolchain.toml) file. To verify, run `rustup show` from the [engine](.) directory.
* CMake [3.X.X >= 3.21.2]
  * CMake installation guidance from the [CMake page](https://cmake.org/install/) or if on MacOS through [brew](https://brew.sh/)
* Python [3.7.x]
  * Python installation guidance from [their website](https://www.python.org/downloads/)
* Flatbuffers [2.0.0]
  * Flatbuffers installation guidance from [their website](https://google.github.io/flatbuffers/flatbuffers_guide_building.html)
    * It's necessary to match the version (2.0.0) with the Rust crate, so build (or otherwise acquire a compiled flatc binary of) the commit associated with the [2.0.0 release](https://github.com/google/flatbuffers/releases/tag/v2.0.0)
      * One way of checking out the right commit is running the following from within the flatbuffers repository:
      
        ```shell
        latestTag=$(git describe --tags `git rev-list --tags --max-count=1`)
        git checkout $latestTag
        ```
* For now, you need a pre-compiled libv8_monolith.a accessible under the `$V8_PATH` environment variable
  * The following will produce the necessary files under `~/.v8/vendor` by downloading a precompiled library from a Ruby Gem. The `<URL TO GEM>` should be the link to the relevant gem on the [rubyjs/libv8 releases page](https://github.com/rubyjs/libv8/releases/tag/v8.4.255.0)
    ```shell
    mkdir -p ~/.v8/tmp # Create the .v8 directory and a tmp folder
    cd ~/.v8/tmp
    curl -L -o libv8.tar.gz <URL TO GEM> # Download the Ruby gem
    tar xf libv8.tar.gz # Extract the gem
    tar xf data.tar.gz # Extract the data folder
    mv -v vendor/v8/* .. # Move out the wanted files
    cd ..
    rm -rf tmp # Delete the tmp folder
    ```
  * With the V8 folder containing `include` and `out.gn` you can then set the variable for your terminal session with `export V8_PATH=<path to folder>` or you can set it permanently by [adding it to your shell's environment](https://unix.stackexchange.com/questions/117467/how-to-permanently-set-environmental-variables)

### macOS Developer Specific Instructions

Due to ARM-Based Macs, the `macos` `target_os` has some added complications for development. 

#### For Intel Macs
Due to limitations in Cargo at the moment we can't properly check if it's being built _on_ an ARM Mac (rather than _for_ an ARM Mac). Due to this it's necessary to:
* Enable the `build-nng` feature by passing `--features "build-nng"` to any cargo commands such as `cargo build`

#### For ARM-Based Macs
At the moment the project only seems to be compiling if you use the `x86_64-apple-darwin` target. This has some added complexity, especially due to the fact that rustc fails to link 'fat-binaries' in certain scenarios.
* It's necessary to acquire an x86 version of `nng`. Currently the easiest known way to do this is through:
  * Creating a homebrew installation under Rosetta, [an example guide is here](https://stackoverflow.com/questions/64882584/how-to-run-the-homebrew-installer-under-rosetta-2-on-m1-macbook) 
  * Using the x86 brew to install `nng` (which will then install an x86 version). This should result in an nng installation at: `/usr/local/Cellar/nng/1.5.2`
* It's then necessary to set the `NNG_PATH` environment variable, similar to `V8_PATH`
  * The command is likely to be: `export NNG_PATH=/usr/local/Cellar/nng/1.5.2`
* If the V8 monolith is failing to link due to symbol errors, it might be necessary to download the gem for the "darwin_universal" version.

### Possible Dependencies and Debugging
Depending on how lightweight your OS install is, you may be missing some low level dependencies, so try the following (examples given for Ubuntu/Debian-based Unix systems):
* `apt-get install build-essentials` - Includes the GCC/g++ compilers, libraries, and some other utilities
* `apt-get install pkg-config` - A helper tool used when compiling applications and libraries
* `apt-get install libssl-dev` - A development package of OpenSSL
* `apt-get install python3-dev` - A collection of developer utilities for Python such as header files (e.g. needed when seeing `fatal error: Python.h: No such file or directory`)
      
### Project Setup / Building
* Run `cargo build`
* Run `./src/worker/runner/python/setup.sh` (following the instructions from the help)

### Running for development
> **WIP** - This section is a work-in-progress. More detailed documentation of the CLI's API will be provided. For now, it's easiest to test by running _single runs_ rather than _simple_ experiments.

The CLI binary handles parsing a HASH project, and the lifetime of the engine for an experiment. To use it, download a project by **TODO: Instructions are WIP, coming shortly**.

Then, run the CLI using:
* `cargo run --bin cli -- <CLI ARGS>`

Where CLI args are described below in the [Usage](#usage) section, an example of a run command during development would be:
* `cargo run --bin cli -- <CLI ARGS> -p  "<PATH TO HASH PROJECT DIR>" single-run --num-steps 5`

## Usage

> **WIP** - This section is a work-in-progress. Guidance on production usage will appear here.

The CLI comes with a short help page: `cli help` or `cli -h`. A more detailed explanation about the parameters are available at the long help page with `cli --help`. To show the help page for subcommands, either append them to the command: `cli help single-run`, or use `-h`/`--help` after the subcommand: `cli single-run --help`.

If one of the environment variables shown in the help page is passed, it will overwrite the default values. Parameters take precedence over environment variables.

## Main Concepts

Being familiar with running experiments and simulations on the HASH platform will help a lot with understanding the Engine. The [docs](https://hash.ai/docs/simulation/?utm_medium=organic&utm_source=github_readme_engine) are also a good place to search for clarification on some terms used below when unclear.

### High-level Overview

> **Note** the links provided in the following section point towards the general relevant parts of the codebase, this section can be treated as an initial guide to the folder and source-code structure.

#### Starting an Experiment / the CLI
Experiments are started through the [CLI](./bin/cli), the main entry-point to the engine. The CLI is responsible for parsing input, starting Workers and simulation runs.

#### Workers
Most logic relating to the model (including, most importantly, user provided behaviors) is executed on [Runners](./src/worker/runner). These are execution environments implemented in Python, JavaScript, or Rust. One of each Language Runner is managed by a single [Worker](./src/worker). Workers then in turn belong to a Worker Pool, a collection of Workers that serve a single experiment.

#### Simulation Runs and the Package System
After initialization, the core of the flow of a [simulation](./src/simulation) is handled within the 'main loop', a pipeline of logic that's applied to each step of the simulation. At the core of this implementation is the Simulation Package System.

A Simulation Package is a contained set of logic belonging to one of the following types:

* Initialization
* Context
* State
* Output

Initialization packages are run before starting the main loop of the simulation. They're responsible setting up the initial state of the agents within the simulation.

Context packages deal with state that encompasses contextual information surrounding the agents within a simulation.

State packages interact with actual agent-state, including things such as executing agent behaviors and correcting spatial positioning.

Output packages are responsible for creating feedback to be given to the user about the simulation run's state, including things like saving snapshots of agent-state or providing analysis and network visualization.

Upon using the initialization packages to initialize the run, the main loop is started which consists of a pipeline going from context packages -> state packages -> output packages for every step.

The packages utilize a [communication implementation](./src/simulation/comms) to interface with the [Workers](./src/worker) mostly through the use of of defined types of [Tasks](./src/simulation/task). The communication therefore defines the control-flow of the Runner's executions. Any substantial data that isn't encapsulated within a message is shared that between Packages and Runners through the [DataStore](./src/datastore).

#### DataStore

The [DataStore](./src/datastore) is the backend responsible for keeping the data between the simulation run main loops and language runners in sync. It encapsulates logic surrounding read/write access, as well as low-level shared memory representation.

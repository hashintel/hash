[comment]: <> (This CONTRIBUTING guide was heavily inspired by the great one provided by the lovely folks at Atom [https://github.com/atom/atom/blob/master/CONTRIBUTING.md])

# Contributing to hEngine

Thank you for your interest in adding to the hEngine!

We've provided the following guidelines to help you with contributions, in addition to the ones described below, we've
also established a set of [community guidelines](https://hash.ai/legal/community) to enable as many people as possible
to contribute to and benefit from HASH. Please follow these when interacting with this repo.

#### Table Of Contents

- [I have a question, where do I go?](#i-have-a-question--where-do-i-go-)

- [Getting started, what do I need to know?](#getting-started--what-do-i-need-to-know-)
    * [Design Decisions](#design-decisions)

- [How Can I Contribute?](#how-can-i-contribute-)
    * [Reporting Bugs](#reporting-bugs)
    * [Suggesting Enhancements](#suggesting-enhancements)
    * [Your First Code Contribution](#your-first-code-contribution)
    * [Pull Requests](#pull-requests)

- [Styleguides](#styleguides)
    * [Rust Styleguide](#rust-styleguide)
    * [JavaScript Styleguide](#javascript-styleguide)
    * [Python Styleguide](#python-styleguide)
    * [Documentation Styleguide](#documentation-styleguide)

- [Additional Notes](#additional-notes)
    * [Issue and Pull Request Labels](#issue-and-pull-request-labels)

> **WIP** This document is a work in-progress, if the section you need isn't finished, please feel free to reach out to us for clarification!

## I have a question, where do I go?

> **Note:** Please don't use GitHub issues for help, we have a friendly community on...

* [Discord](https://discord.com/invite/BPMrGAhjPh)
* [Our Forum](https://community.hash.ai/)
* And any other methods outlined on [our site](https://hash.ai/contact)

## Getting started, what do I need to know?

### Design Decisions

> TODO

## How Can I Contribute?

### Reporting Bugs

While using our products, you may encounter unwanted behavior, and if that should happen, please do report it to us! No project is perfect, and helping us keeping track of problems is always appreciated. 

To help you help us, we've written this section to give some guidelines on the sort of information that will help us investigate and hopefully help you.

#### Before Submitting A Bug Report

Try and check to see if it's already been reported, the main place to look would be the [Github Issues board](https://github.com/hashintel/hash/issues). If you can't find something similar, then feel free to create a new one! Be sure to label it with the `hengine` label to help the right team find it.

#### How Do I Submit A (Good) Bug Report?

So you've found a bug, next up is collecting useful information to give us to investigate.

* **Give a clear title of what the problem is** (or what you believe it to be)
* If you can, **describe how to reproduce it**, otherwise try and give as much information about how it happened. (What you did, _how_ you did it, etc.) As an example of some useful information depending on the context:
  * Runtime parameters
  * The simulation you were running
  * The step of the build you were at
  * Any configuration you've supplied
* **Describe the environment it was running in**
  * What hardware, as an example:
    * Your computer manufacturer
    * Amount of RAM
    * CPU model
  * What operating system was it running on
  * What versions of the dependencies are you running
    * e.g. tell us your version of Rust, Python, cmake, etc.
  * Any environment variables that might have affected it
* **Provide _all_ relevant logs**
  * Try not to just provide summarised descriptions of what was logged, we like full log-outputs. If you can reproduce it, try running it with trace logs (RUST_LOG=trace)

### Suggesting Enhancements

> TODO

#### Before Submitting An Enhancement Suggestion

> TODO

#### How Do I Submit A (Good) Enhancement Suggestion?

> TODO

### Your First Code Contribution

> TODO

#### Local development

> TODO

### Pull Requests

> TODO

## Styleguides

### Rust Styleguide

> TODO

We are using [`cargo fmt`](https://github.com/rust-lang/rustfmt) and [`cargo clippy`](https://github.com/rust-lang/rust-clippy) to apply linting rules to our Rust codebase. In order to run those, you need to install them first (unless they are already installed, which is the default):
* `rustup component add rustfmt`
* `rustup component add clippy`

Then simply run them with:
* `cargo fmt`
* `cargo clippy`

### JavaScript Styleguide

> TODO

### Python Styleguide

> TODO

### Documentation Styleguide

> TODO

#### Example

> TODO

## Additional Notes

### Issue and Pull Request Labels

> TODO

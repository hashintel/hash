[license]: https://github.com/hashintel/hash/blob/main/libs/darwin-kperf/LICENSE.md
[Apache License, Version 2.0]: https://github.com/hashintel/hash/blob/main/libs/darwin-kperf/LICENSE-APACHE.md
[MIT license]: https://github.com/hashintel/hash/blob/main/libs/darwin-kperf/LICENSE-MIT.md

# darwin-kperf

**Rust bindings to Apple's `kperf` kernel performance monitoring framework.**

> **⚠️ Experimental.** These crates depend on Apple's *private* `kperf.framework`
> and `kperfdata.framework`, which are not part of any public SDK and carry no ABI
> stability guarantee. Apple may change struct layouts, function signatures, or
> remove symbols entirely in any macOS update. Additionally, meaningful testing
> requires root privileges on physical Apple Silicon hardware. The test suite
> cannot run in CI, sandboxed environments, or under Miri (FFI boundary).

`kperf` is a private macOS framework that exposes hardware performance counters (CPU cycles, instructions retired, cache misses, branch mispredictions, etc.) with extremely low overhead. It is the same infrastructure backing Instruments and `xctrace`.

## Crates

| Crate | Description |
| --- | --- |
| [`darwin-kperf`](https://crates.io/crates/darwin-kperf) | Safe Rust API for configuring and sampling performance counters |
| [`darwin-kperf-sys`](https://crates.io/crates/darwin-kperf-sys) | Raw FFI bindings to `kperf.framework` and `kperfdata.framework` |
| [`darwin-kperf-events`](https://crates.io/crates/darwin-kperf-events) | Apple Silicon PMU event definitions (M1-M5), auto-generated from plist databases |
| [`darwin-kperf-criterion`](https://crates.io/crates/darwin-kperf-criterion) | Criterion.rs measurement plugin for hardware-counter benchmarking |

## Platform support

macOS only. Requires root privileges or the `com.apple.private.kernel.kpc` entitlement to access performance counters.

## Example

```rust,ignore
use darwin_kperf::{Sampler, event::Event};

let sampler = Sampler::new()?;
let mut thread = sampler.thread([Event::FixedInstructions, Event::FixedCycles])?;

thread.start()?;
let before = thread.sample()?;
// ... do work ...
let after = thread.sample()?;
thread.stop()?;

let instructions = after[0] - before[0];
let cycles = after[1] - before[1];
```

## Testing

All integration tests require root and are marked `#[ignore]`:

```sh
sudo -E cargo test --package darwin-kperf -- --ignored --nocapture
```

## References

- [ibireme's `kpc_demo.c`](https://gist.github.com/ibireme/173517c208c7dc333ba962c1f0d67d12): the reference C implementation this crate is modeled after.

## Contributors

`darwin-kperf` was created by [Bilal Mahmoud](https://github.com/indietyp). It is being developed in conjunction with [HASH](https://hash.dev/) as an open-source project. We gratefully accept external contributions and have published a [contributing guide](https://github.com/hashintel/hash/blob/main/.github/CONTRIBUTING.md) that outlines the process. If you have questions, please create a [discussion](https://github.com/orgs/hashintel/discussions). You can also report bugs [directly on the GitHub repo](https://github.com/hashintel/hash/issues/new/choose).

## License

`darwin-kperf` is available under either of the [Apache License, Version 2.0] or [MIT license] at your option. Please see the [LICENSE] file to review your options.

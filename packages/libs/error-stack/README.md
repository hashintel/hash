[announcement post]: https://hash.dev/blog/announcing-error-stack
[crates.io]: https://crates.io/crates/error-stack
[libs.rs]: https://lib.rs/crates/error-stack
[rust-version]: https://www.rust-lang.org
[documentation]: https://docs.rs/error-stack
[license]: ./LICENSE.md
[discord]: https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_hash-repo_error-stack

[![crates.io](https://img.shields.io/crates/v/error-stack)][crates.io]
[![libs.rs](https://img.shields.io/badge/libs.rs-error--stack-orange)][libs.rs]
[![rust-version](https://img.shields.io/badge/Rust-1.63.0-orange)][rust-version]
[![documentation](https://img.shields.io/docsrs/error-stack)][documentation]
[![license](https://img.shields.io/crates/l/error-stack)][license]
[![discord](https://img.shields.io/discord/840573247803097118)][discord]

[Open issues](https://github.com/hashintel/hash/issues?q=is%3Aissue+is%3Aopen+label%3AA-error-stack) / [Discussions](https://github.com/hashintel/hash/discussions?discussions_q=label%3AA-error-stack)

# error-stack

**`error-stack` is a context-aware error-handling library that supports arbitrary attached user data.**

Read our [announcement post] for the story behind its origins.

The library enables building a `Report` around an error as it propagates:

```rust
use std::fmt;

use error_stack::{Context, IntoReport, Report, Result, ResultExt};

#[derive(Debug)]
struct ParseExperimentError;

impl fmt::Display for ParseExperimentError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("invalid experiment description")
    }
}

impl Context for ParseExperimentError {}

fn parse_experiment(description: &str) -> Result<(u64, u64), ParseExperimentError> {
    let value = description
        .parse()
        .into_report()
        .attach_printable_lazy(|| format!("{description:?} could not be parsed as experiment"))
        .change_context(ParseExperimentError)?;

    Ok((value, 2 * value))
}

#[derive(Debug)]
struct ExperimentError;

impl fmt::Display for ExperimentError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Experiment error: Could not run experiment")
    }
}

impl Context for ExperimentError {}

fn start_experiments(
    experiment_ids: &[usize],
    experiment_descriptions: &[&str],
) -> Result<Vec<u64>, ExperimentError> {
    let experiments = experiment_ids
        .iter()
        .map(|exp_id| {
            let description = experiment_descriptions.get(*exp_id).ok_or_else(|| {
                Report::new(ExperimentError)
                    .attach_printable(format!("Experiment {exp_id} has no valid description"))
            })?;

            let experiment = parse_experiment(description)
                .attach_printable(format!("Experiment {exp_id} could not be parsed"))
                .change_context(ExperimentError)?;

            Ok(move || experiment.0 * experiment.1)
        })
        .collect::<Result<Vec<_>, ExperimentError>>()
        .attach_printable("Unable to set up experiments")?;

    Ok(experiments.iter().map(|experiment| experiment()).collect())
}

fn main() -> Result<(), ExperimentError> {
    let experiment_ids = &[0, 2];
    let experiment_descriptions = &["10", "20", "3o"];
    start_experiments(experiment_ids, experiment_descriptions)?;

    Ok(())
}
```

This will most likely result in an error and print

<pre>
Error: <span style="font-weight:bold;">Experiment error: Could not run experiment</span>
<span style="color:red;">├</span><span style="color:red;">╴</span><span style="filter: contrast(70%) brightness(190%);color:dimgray;">examples/demo.rs:54:18</span>
<span style="color:red;">├</span><span style="color:red;">╴</span>Unable to set up experiments
<span style="color:red;">│</span>
<span style="color:red;">├</span><span style="color:red;">─</span><span style="color:red;">▶</span><span style="color:red;"> </span><span style="font-weight:bold;">invalid experiment description</span>
<span style="color:red;">│</span><span style="color:red;"> </span><span style="color:red;"> </span><span style="color:red;"> </span><span style="color:red;">├</span><span style="color:red;">╴</span><span style="filter: contrast(70%) brightness(190%);color:dimgray;">examples/demo.rs:24:10</span>
<span style="color:red;">│</span><span style="color:red;"> </span><span style="color:red;"> </span><span style="color:red;"> </span><span style="color:red;">╰</span><span style="color:red;">╴</span>Experiment 2 could not be parsed
<span style="color:red;">│</span>
<span style="color:red;">╰</span><span style="color:red;">─</span><span style="color:red;">▶</span><span style="color:red;"> </span><span style="font-weight:bold;">invalid digit found in string</span>
<span style="color:red;"> </span><span style="color:red;"> </span><span style="color:red;"> </span><span style="color:red;"> </span><span style="color:red;">├</span><span style="color:red;">╴</span><span style="filter: contrast(70%) brightness(190%);color:dimgray;">examples/demo.rs:22:10</span>
<span style="color:red;"> </span><span style="color:red;"> </span><span style="color:red;"> </span><span style="color:red;"> </span><span style="color:red;">├</span><span style="color:red;">╴</span>&quot;3o&quot; could not be parsed as experiment
<span style="color:red;"> </span><span style="color:red;"> </span><span style="color:red;"> </span><span style="color:red;"> </span><span style="color:red;">╰</span><span style="color:red;">╴</span>backtrace with 28 frames (1)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Backtrace No. 1
   0: std::backtrace_rs::backtrace::libunwind::trace
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/std/src/../../backtrace/src/backtrace/mod.rs:66:5
   1: std::backtrace_rs::backtrace::trace_unsynchronized
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/std/src/../../backtrace/src/backtrace/mod.rs:66:5
   2: std::backtrace::Backtrace::create
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/std/src/backtrace.rs:328:13
   3: error_stack::report::Report&lt;C&gt;::new
             at ./src/report.rs:242:18
   4: error_stack::context::&lt;impl core::convert::From&lt;C&gt; for error_stack::report::Report&lt;C&gt;&gt;::from
             at ./src/context.rs:81:9
   5: &lt;core::result::Result&lt;T,E&gt; as error_stack::ext::result::IntoReport&gt;::into_report
             at ./src/ext/result.rs:210:31
   6: demo::parse_experiment
             at ./examples/demo.rs:20:17
   7: demo::start_experiments::{{closure}}
             at ./examples/demo.rs:52:30
   8: core::iter::adapters::map::map_try_fold::{{closure}}
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/core/src/iter/adapters/map.rs:91:28
   9: core::iter::traits::iterator::Iterator::try_fold
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/core/src/iter/traits/iterator.rs:2238:21
  10: &lt;core::iter::adapters::map::Map&lt;I,F&gt; as core::iter::traits::iterator::Iterator&gt;::try_fold
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/core/src/iter/adapters/map.rs:117:9
  11: &lt;core::iter::adapters::GenericShunt&lt;I,R&gt; as core::iter::traits::iterator::Iterator&gt;::try_fold
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/core/src/iter/adapters/mod.rs:191:9
  12: core::iter::traits::iterator::Iterator::try_for_each
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/core/src/iter/adapters/mod.rs:174:9
  13: &lt;core::iter::adapters::GenericShunt&lt;I,R&gt; as core::iter::traits::iterator::Iterator&gt;::next
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/core/src/iter/adapters/mod.rs:174:9
  14: alloc::vec::Vec&lt;T,A&gt;::extend_desugared
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/alloc/src/vec/mod.rs:2748:35
  15: &lt;alloc::vec::Vec&lt;T,A&gt; as alloc::vec::spec_extend::SpecExtend&lt;T,I&gt;&gt;::spec_extend
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/alloc/src/vec/spec_extend.rs:18:9
  16: &lt;alloc::vec::Vec&lt;T&gt; as alloc::vec::spec_from_iter_nested::SpecFromIterNested&lt;T,I&gt;&gt;::from_iter
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/alloc/src/vec/spec_from_iter_nested.rs:43:9
  17: &lt;alloc::vec::Vec&lt;T&gt; as alloc::vec::spec_from_iter::SpecFromIter&lt;T,I&gt;&gt;::from_iter
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/alloc/src/vec/spec_from_iter.rs:33:9
  18: &lt;alloc::vec::Vec&lt;T&gt; as core::iter::traits::collect::FromIterator&lt;T&gt;&gt;::from_iter
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/alloc/src/vec/mod.rs:2648:9
  19: core::iter::traits::iterator::Iterator::collect
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/core/src/result.rs:2101:49
  20: &lt;core::result::Result&lt;V,E&gt; as core::iter::traits::collect::FromIterator&lt;core::result::Result&lt;A,E&gt;&gt;&gt;::from_iter::{{closure}}
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/core/src/result.rs:2101:49
  21: core::iter::adapters::try_process
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/core/src/iter/adapters/mod.rs:160:17
  22: &lt;core::result::Result&lt;V,E&gt; as core::iter::traits::collect::FromIterator&lt;core::result::Result&lt;A,E&gt;&gt;&gt;::from_iter
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/core/src/result.rs:2101:9
  23: core::iter::traits::iterator::Iterator::collect
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/core/src/iter/traits/iterator.rs:1836:9
  24: demo::start_experiments
             at ./examples/demo.rs:44:23
  25: demo::main
             at ./examples/demo.rs:67:5
  26: core::ops::function::FnOnce::call_once
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/core/src/ops/function.rs:248:5
  27: std::sys_common::backtrace::__rust_begin_short_backtrace
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/std/src/sys_common/backtrace.rs:122:18
  28: std::rt::lang_start::{{closure}}
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/std/src/rt.rs:145:18
  29: core::ops::function::impls::&lt;impl core::ops::function::FnOnce&lt;A&gt; for &amp;F&gt;::call_once
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/core/src/ops/function.rs:280:13
  30: std::panicking::try::do_call
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/std/src/panicking.rs:492:40
  31: std::panicking::try
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/std/src/panicking.rs:456:19
  32: std::panic::catch_unwind
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/std/src/panic.rs:137:14
  33: std::rt::lang_start_internal::{{closure}}
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/std/src/rt.rs:128:48
  34: std::panicking::try::do_call
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/std/src/panicking.rs:492:40
  35: std::panicking::try
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/std/src/panicking.rs:456:19
  36: std::panic::catch_unwind
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/std/src/panic.rs:137:14
  37: std::rt::lang_start_internal
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/std/src/rt.rs:128:20
  38: std::rt::lang_start
             at /rustc/d394408fb38c4de61f765a3ed5189d2731a1da91/library/std/src/rt.rs:144:17
  39: _main
</pre>


Please see the [documentation] for a full description.

## Troubleshooting

### Emacs [rust-mode](https://github.com/rust-lang/rust-mode) workaround

Due to [rust-lang/rust-mode#452](https://github.com/rust-lang/rust-mode/issues/452), errors messages are improperly parsed. As a result, the error messages show incorrect highlighting but also yield an incorrect hyperlink.

The one workaround is to modify the regular expression used to format the string and create a hyperlink.

```emacs-lisp
(setq cargo-compilation-regexps
      '("\\(?:at\\|',\\) \\(\\([^:\s]+\\):\\([0-9]+\\)\\)"
        2 3 nil nil 1))
```

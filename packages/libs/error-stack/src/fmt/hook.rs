// We allow dead-code here, because some of the functions are only exposed when `feature = "std"`
// we could do cfg for everything, but that gets very messy, instead we only use a subset
// and enable deadcode on `feature = "std"`.
#![cfg_attr(not(feature = "std"), allow(dead_code))]
// We allow `unreachable_pub` on no-std, because in that case we do not export (`pub`) the
// structures contained in here, but still use them, otherwise we would need to have two redundant
// implementation: `pub(crate)` and `pub`.
#![cfg_attr(not(feature = "std"), allow(unreachable_pub))]

use alloc::{boxed::Box, string::String, vec::Vec};
use core::{any::TypeId, mem};

pub(crate) use default::install_builtin_hooks;

use crate::fmt::Frame;

pub struct Format {
    alternate: bool,

    body: Vec<String>,
    appendix: Vec<String>,
}

impl Format {
    pub(crate) const fn new(alternate: bool) -> Self {
        Self {
            alternate,
            body: Vec::new(),
            appendix: Vec::new(),
        }
    }

    pub fn body(&self) -> &[String] {
        &self.body
    }

    pub fn appendix(&self) -> &[String] {
        &self.appendix
    }

    fn take_body(&mut self) -> Vec<String> {
        mem::take(&mut self.body)
    }
}

/// Carrier for contextual information used across hook invocations.
///
/// `HookContext` has two fundamental use-cases:
/// 1) Adding body entries and appendix entries
/// 2) Storage
///
/// ## Adding body entries and appendix entries
///
/// A [`Debug`] backtrace consists of two different sections, a rendered tree of objects (the
/// **body**) and additional text/information that is too large to fit into the tree (the
/// **appendix**).
///
/// Entries for the body can be attached to the rendered tree of objects via
/// [`HookContext::push_body`]. An appendix entry can be attached via
/// [`HookContext::push_appendix`].
///
/// [`Debug`]: core::fmt::Debug
///
/// ### Example
///
/// ```rust
/// # // we only test with Rust 1.65, which means that `render()` is unused on earlier version
/// # #![cfg_attr(not(rust_1_65), allow(dead_code, unused_variables, unused_imports))]
/// use std::io::{Error, ErrorKind};
///
/// use error_stack::Report;
///
/// struct Warning(&'static str);
/// struct HttpResponseStatusCode(u64);
/// struct Suggestion(&'static str);
/// struct Secret(&'static str);
///
/// Report::install_debug_hook::<HttpResponseStatusCode>(|HttpResponseStatusCode(value), context| {
///     // Create a new appendix, which is going to be displayed when someone requests the alternate
///     // version (`:#?`) of the report.
///     if context.alternate() {
///         context.push_appendix(format!("error {value}: {} error", if *value < 500 {"client"} else {"server"}))
///     }
///
///     // This will push a new entry onto the body with the specified value
///     context.push_body(format!("error code: {value}"));
/// });
///
/// Report::install_debug_hook::<Suggestion>(|Suggestion(value), context| {
///     let idx = context.increment_counter();
///
///     // Create a new appendix, which is going to be displayed when someone requests the alternate
///     // version (`:#?`) of the report.
///     if context.alternate() {
///         context.push_body(format!("suggestion {idx}:\n  {value}"));
///     }
///
///     // This will push a new entry onto the body with the specified value
///     context.push_body(format!("suggestion ({idx})"));
/// });
///
/// Report::install_debug_hook::<Warning>(|Warning(value), context| {
///     // You can add multiples entries to the body (and appendix) in the same hook.
///     context.push_body("abnormal program execution detected");
///     context.push_body(format!("warning: {value}"));
/// });
///
/// // By not adding anything you are able to hide an attachment
/// // (it will still be counted towards opaque attachments)
/// Report::install_debug_hook::<Secret>(|_, _| {});
///
/// let report = Report::new(Error::from(ErrorKind::InvalidInput))
///     .attach(HttpResponseStatusCode(404))
///     .attach(Suggestion("do you have a connection to the internet?"))
///     .attach(HttpResponseStatusCode(405))
///     .attach(Warning("unable to determine environment"))
///     .attach(Secret("pssst, don't tell anyone else c;"))
///     .attach(Suggestion("execute the program from the fish shell"))
///     .attach(HttpResponseStatusCode(501))
///     .attach(Suggestion("try better next time!"));
///
/// # owo_colors::set_override(true);
/// # fn render(value: String) -> String {
/// #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
/// #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
/// #
/// #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
/// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
/// #
/// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
/// # }
/// #
/// # #[cfg(rust_1_65)]
/// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__emit.snap")].assert_eq(&render(format!("{report:?}")));
/// #
/// println!("{report:?}");
///
/// # #[cfg(rust_1_65)]
/// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__emit_alt.snap")].assert_eq(&render(format!("{report:#?}")));
/// #
/// println!("{report:#?}");
/// ```
///
/// The output of `println!("{report:?}")`:
///
/// <pre>
#[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__emit.snap"))]
/// </pre>
///
/// The output of `println!("{report:#?}")`:
///
/// <pre>
#[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__emit_alt.snap"))]
/// </pre>
///
/// ## Storage
///
/// `HookContext` can be used to store and retrieve values that are going to be used on multiple
/// hook invocations in a single [`Debug`] call.
///
/// Every hook can request their corresponding `HookContext`.
/// This is especially useful for incrementing/decrementing values, but can also be used to store
/// any arbitrary value for the duration of the [`Debug`] invocation.
///
/// All data stored in `HookContext` is completely separated from all other hooks and can store
/// any arbitrary data of any type, and even data of multiple types at the same time.
///
/// ### Example
///
/// ```rust
/// # // we only test with Rust 1.65, which means that `render()` is unused on earlier version
/// # #![cfg_attr(not(rust_1_65), allow(dead_code, unused_variables, unused_imports))]
/// use std::io::ErrorKind;
///
/// use error_stack::Report;
///
/// struct Computation(u64);
///
/// Report::install_debug_hook::<Computation>(|Computation(value), context| {
///     // Get a value of type `u64`, if we didn't insert one yet, default to 0
///     let mut acc = context.get::<u64>().copied().unwrap_or(0);
///     acc += *value;
///
///     // Get a value of type `f64`, if we didn't insert one yet, default to 1.0
///     let mut div = context.get::<f32>().copied().unwrap_or(1.0);
///     div /= *value as f32;
///
///     // Insert the calculated `u64` and `f32` back into storage, so that we can use them
///     // in the invocations following this one (for the same `Debug` call)
///     context.insert(acc);
///     context.insert(div);
///
///     context.push_body(format!(
///         "computation for {value} (acc = {acc}, div = {div})"
///     ));
/// });
///
/// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
///     .attach(Computation(2))
///     .attach(Computation(3));
///
/// # owo_colors::set_override(true);
/// # fn render(value: String) -> String {
/// #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
/// #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
/// #
/// #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
/// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
/// #
/// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
/// # }
/// #
/// # #[cfg(rust_1_65)]
/// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_storage.snap")].assert_eq(&render(format!("{report:?}")));
/// #
/// println!("{report:?}");
/// ```
///
/// <pre>
#[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_storage.snap"))]
/// </pre>
///
/// [`Debug`]: core::fmt::Debug
pub type HookContext<T> = crate::hook::context::HookContext<Format, T>;

impl<T> HookContext<T> {
    pub(crate) fn appendix(&self) -> &[String] {
        self.inner().extra().appendix()
    }

    /// The contents of the appendix are going to be displayed after the body in the order they have
    /// been pushed into the [`HookContext`].
    ///
    /// This is useful for dense information like backtraces, or span traces.
    ///
    /// # Example
    ///
    /// ```rust
    /// # // we only test with Rust 1.65, which means that `render()` is unused on earlier version
    /// # #![cfg_attr(not(rust_1_65), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io::ErrorKind;
    ///
    /// use error_stack::Report;
    ///
    /// struct Error {
    ///     code: usize,
    ///     reason: &'static str,
    /// }
    ///
    /// Report::install_debug_hook::<Error>(|Error { code, reason }, context| {
    ///     if context.alternate() {
    ///         // Add an entry to the appendix
    ///         context.push_appendix(format!("error {code}:\n  {reason}"));
    ///     }
    ///
    ///     context.push_body(format!("error {code}"));
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(Error {
    ///         code: 404,
    ///         reason: "not found - server cannot find requested resource",
    ///     })
    ///     .attach(Error {
    ///         code: 405,
    ///         reason: "bad request - server cannot or will not process request",
    ///     });
    ///
    /// # owo_colors::set_override(true);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_emit.snap")].assert_eq(&render(format!("{report:#?}")));
    /// #
    /// println!("{report:#?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_emit.snap"))]
    /// </pre>
    pub fn push_appendix(&mut self, content: impl Into<String>) {
        self.inner_mut().extra_mut().appendix.push(content.into());
    }

    /// Add a new entry to the body.
    ///
    /// # Example
    ///
    /// ```rust
    /// # // we only test with Rust 1.65, which means that `render()` is unused on earlier version
    /// # #![cfg_attr(not(rust_1_65), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io;
    ///
    /// use error_stack::Report;
    ///
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(value), context| {
    ///     context.push_body(format!("suggestion: {value}"));
    ///     // We can push multiples entries in a single hook, these lines will be added one after
    ///     // another.
    ///     context.push_body("sorry for the inconvenience!");
    /// });
    ///
    /// let report = Report::new(io::Error::from(io::ErrorKind::InvalidInput))
    ///     .attach(Suggestion("try better next time"));
    ///
    /// # owo_colors::set_override(true);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__diagnostics_add.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__diagnostics_add.snap"))]
    /// </pre>
    pub fn push_body(&mut self, content: impl Into<String>) {
        self.inner_mut().extra_mut().body.push(content.into());
    }

    /// Returns if the currently requested format should render the alternate representation.
    ///
    /// This corresponds to the output of [`std::fmt::Formatter::alternate`].
    #[must_use]
    pub const fn alternate(&self) -> bool {
        self.inner().extra().alternate
    }

    pub(crate) fn take_body(&mut self) -> Vec<String> {
        self.inner_mut().extra_mut().take_body()
    }
}

type BoxedHook = Box<dyn Fn(&Frame, &mut HookContext<Frame>) -> bool + Send + Sync>;

fn into_boxed_hook<T: Send + Sync + 'static>(
    hook: impl Fn(&T, &mut HookContext<T>) + Send + Sync + 'static,
) -> BoxedHook {
    Box::new(move |frame: &Frame, context: &mut HookContext<Frame>| {
        #[cfg(nightly)]
        {
            frame
                .request_ref::<T>()
                .map(|value| hook(value, context.cast()))
                .or_else(|| {
                    frame
                        .request_value::<T>()
                        .map(|ref value| hook(value, context.cast()))
                })
                .is_some()
        }

        // emulate the behavior from nightly by searching for
        //  - `Context::provide`: not available
        //  - `Attachment`s: provide themself, emulated by `downcast_ref`
        #[cfg(not(nightly))]
        matches!(frame.kind(), crate::FrameKind::Attachment(_))
            .then_some(frame)
            .and_then(Frame::downcast_ref::<T>)
            .map(|value| hook(value, context.cast()))
            .is_some()
    })
}

/// Holds list of hooks.
///
/// These are used to augment the [`Debug`] information of attachments and contexts, which are
/// normally not printable.
///
/// Hooks are added via [`.insert()`], which will wrap the function in an additional closure.
/// This closure will downcast/request the [`Frame`] to the requested type.
///
/// If not set, opaque attachments (added via [`.attach()`]) won't be rendered in the [`Debug`]
/// output.
///
/// The default implementation provides supports for [`Backtrace`] and [`SpanTrace`],
/// if their necessary features have been enabled.
///
/// [`Backtrace`]: std::backtrace::Backtrace
/// [`SpanTrace`]: tracing_error::SpanTrace
/// [`Display`]: core::fmt::Display
/// [`Debug`]: core::fmt::Debug
/// [`.insert()`]: Hooks::insert
#[cfg(any(feature = "std", feature = "hooks"))]
pub(crate) struct Hooks {
    // We use `Vec`, instead of `HashMap` or `BTreeMap`, so that ordering is consistent with the
    // insertion order of types.
    pub(crate) inner: Vec<(TypeId, BoxedHook)>,
}

#[cfg(any(feature = "std", feature = "hooks"))]
impl Hooks {
    pub(crate) fn insert<T: Send + Sync + 'static>(
        &mut self,
        hook: impl Fn(&T, &mut HookContext<T>) + Send + Sync + 'static,
    ) {
        let type_id = TypeId::of::<T>();

        // make sure that previous hooks of the same TypeId are deleted.
        self.inner.retain(|(id, _)| *id != type_id);
        // push new hook onto the stack
        self.inner.push((type_id, into_boxed_hook(hook)));
    }

    pub(crate) fn call(&self, frame: &Frame, context: &mut HookContext<Frame>) -> bool {
        let mut hit = false;

        for (_, hook) in &self.inner {
            hit = hook(frame, context) || hit;
        }

        hit
    }
}

mod default {
    #![allow(unused_imports)]

    #[cfg(feature = "pretty-print")]
    use alloc::string::ToString;
    use alloc::{format, vec, vec::Vec};
    use core::{
        any::TypeId,
        panic::Location,
        sync::atomic::{AtomicBool, Ordering},
    };
    #[cfg(all(rust_1_65, feature = "std"))]
    use std::backtrace::Backtrace;
    #[cfg(feature = "std")]
    use std::sync::Once;

    #[cfg(feature = "pretty-print")]
    use owo_colors::{OwoColorize, Stream};
    #[cfg(all(not(feature = "std"), feature = "hooks"))]
    use spin::once::Once;
    #[cfg(feature = "spantrace")]
    use tracing_error::SpanTrace;

    use crate::{
        fmt::hook::{into_boxed_hook, BoxedHook, HookContext},
        Frame, Report,
    };

    pub(crate) fn install_builtin_hooks() {
        // We could in theory remove this and replace it with a single AtomicBool.
        static INSTALL_BUILTIN: Once = Once::new();

        // This static makes sure that we only run once, if we wouldn't have this guard we would
        // deadlock, as `install_debug_hook` calls `install_builtin_hooks`, and according to the
        // docs:
        //
        // > If the given closure recursively invokes call_once on the same Once instance the exact
        // > behavior is not specified, allowed outcomes are a panic or a deadlock.
        //
        // This limitation is not present for the implementation from the spin crate, but for
        // simplicity and readability the extra guard is kept.
        static INSTALL_BUILTIN_RUNNING: AtomicBool = AtomicBool::new(false);

        // This has minimal overhead, as `Once::call_once` calls `.is_completed` as the short path
        // we just move it out here, so that we're able to check `INSTALL_BUILTIN_RUNNING`
        if INSTALL_BUILTIN.is_completed() || INSTALL_BUILTIN_RUNNING.load(Ordering::Acquire) {
            return;
        }

        INSTALL_BUILTIN.call_once(|| {
            INSTALL_BUILTIN_RUNNING.store(true, Ordering::Release);

            Report::install_debug_hook::<Location>(location);

            #[cfg(all(feature = "std", rust_1_65))]
            Report::install_debug_hook::<Backtrace>(backtrace);

            #[cfg(feature = "spantrace")]
            Report::install_debug_hook::<SpanTrace>(span_trace);
        });
    }

    #[cfg(feature = "pretty-print")]
    enum LocationDisplay<'a> {
        Color(&'a Location<'static>),
        None(&'a Location<'static>),
    }

    #[cfg(feature = "pretty-print")]
    impl<'a> LocationDisplay<'a> {
        const fn location(&self) -> &'a Location<'static> {
            match self {
                Self::Color(location) | Self::None(location) => location,
            }
        }
    }

    #[cfg(feature = "pretty-print")]
    impl<'a> core::fmt::Display for LocationDisplay<'a> {
        fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
            match self {
                Self::Color(location) => {
                    core::fmt::Display::fmt(&OwoColorize::bright_black(location), f)
                }
                Self::None(location) => f.write_fmt(format_args!("at {location}")),
            }
        }
    }

    fn location(location: &Location<'static>, context: &mut HookContext<Location<'static>>) {
        #[cfg(feature = "pretty-print")]
        {
            let display = LocationDisplay::None(location);
            let body = display.if_supports_color(Stream::Stdout, |value| {
                LocationDisplay::Color(value.location())
            });

            context.push_body(body.to_string());
        }

        #[cfg(not(feature = "pretty-print"))]
        context.push_body(format!("at {location}"));
    }

    #[cfg(all(feature = "std", rust_1_65))]
    fn backtrace(backtrace: &Backtrace, context: &mut HookContext<Backtrace>) {
        let idx = context.increment_counter();

        context.push_appendix(format!("backtrace no. {}\n{backtrace}", idx + 1));
        #[cfg(nightly)]
        context.push_body(format!(
            "backtrace with {} frames ({})",
            backtrace.frames().len(),
            idx + 1
        ));
        #[cfg(not(nightly))]
        context.push_body(format!("backtrace ({})", idx + 1));
    }

    #[cfg(feature = "spantrace")]
    fn span_trace(span_trace: &SpanTrace, context: &mut HookContext<SpanTrace>) {
        let idx = context.increment_counter();

        let mut span = 0;
        span_trace.with_spans(|_, _| {
            span += 1;
            true
        });

        context.push_appendix(format!("span trace No. {}\n{span_trace}", idx + 1));
        context.push_body(format!("span trace with {span} frames ({})", idx + 1));
    }
}

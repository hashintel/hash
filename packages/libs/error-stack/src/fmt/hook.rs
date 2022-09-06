// We allow dead-code here, because some of the functions are only exposed when `feature = "hooks"`
// we could do cfg for everything, but that gets very messy, instead we only use a subset
// and enable deadcode on `feature = "std"`.
#![cfg_attr(not(feature = "std"), allow(dead_code))]
// We allow `unreachable_pub` on no-std, because in that case we do not export (`pub`) the
// structures contained in here, but still use them, otherwise we would need to have two redundant
// implementation: `pub(crate)` and `pub`.
#![cfg_attr(not(feature = "std"), allow(unreachable_pub))]

use alloc::{boxed::Box, collections::BTreeMap, string::String, vec::Vec};
use core::{
    any::{Any, TypeId},
    marker::PhantomData,
};
use std::mem;

#[cfg(feature = "std")]
pub(crate) use default::install_builtin_hooks;

use crate::fmt::{Emit, Frame};

type Storage = BTreeMap<TypeId, BTreeMap<TypeId, Box<dyn Any>>>;

#[derive(Debug)]
pub(crate) struct HookContextInner {
    storage: Storage,

    alternate: bool,
    emits: Vec<Emit>,
    snippets: Vec<Emit>,

    snippet_strings: Vec<String>,
}

impl HookContextInner {
    fn storage(&self) -> &Storage {
        &self.storage
    }

    fn storage_mut(&mut self) -> &mut Storage {
        &mut self.storage
    }

    const fn alternate(&self) -> bool {
        self.alternate
    }

    fn take_emits(&mut self) -> (Vec<Emit>, Vec<Emit>) {
        (mem::take(&mut self.emits), mem::take(&mut self.snippets))
    }

    fn append_snippet_string(&mut self, snippets: &mut Vec<String>) {
        self.snippet_strings.append(snippets);
    }

    fn snippet_strings(&self) -> &[String] {
        &self.snippet_strings
    }
}

impl HookContextInner {
    fn new(alternate: bool) -> Self {
        Self {
            storage: Storage::default(),
            snippets: Vec::new(),
            emits: Vec::new(),
            alternate,
            snippet_strings: vec![],
        }
    }
}

/// Carrier for contextual information used across hook invocations.
///
/// `HookContext` has two fundamental use-cases:
/// 1) Emitting Snippets
/// 2) Storage
///
/// ## Emitting lines and snippets
///
/// A [`Debug`] backtrace consists of two different sections, a rendered tree of objects and
/// additional text/information that is too large to fit into the tree.
///
/// Lines can be attached to the rendered tree of objects via [`HookContext::emit`], or
/// [`HookContext::emit_deferred`]. Snippets can be added to the current output via
/// [`HookContext::snippet`], or [`HookContext::snippet_deferred`].
///
/// [`Debug`]: core::fmt::Debug
///
/// ### `emit`/`snippet` vs. `emit_deferred`/`snippet_deferred`
///
/// Lines and snippets can be emitted either immediately or deferred until the current stack, where
/// a stack is a list of attachments until a frame which has more than a single source.
///
/// To emit a line immediately use [`HookContext::emit`] and [`HookContext::snippet`] for snippets,
/// use [`HookContext::emit_deferred`] for deferred lines and [`HookContext::snippet_deferred`] for
/// snippets.
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
/// // You can emit a line, which is going to be emitted immediately.
/// Report::install_debug_hook::<HttpResponseStatusCode>(|HttpResponseStatusCode(val), ctx| {
///     // This is going to be emitted immediately in the list of snippets, but only if we
///     // `format!("{report:#?}")`
///     if ctx.alternate() {
///         ctx.snippet(format!("Error {val}: {} Error", if *val < 500 {"Client"} else {"Server"}))
///     }
///
///     ctx.emit(format!("Error code: {val}"));
/// });
///
/// // You can emit a line which is deferred to the end of the stack.
/// Report::install_debug_hook::<Suggestion>(|Suggestion(val), ctx| {
///     let idx = ctx.increment();
///
///     // deferred snippets are deferred until the end of snippets of the current stack,
///     // but only if we `format!("{report:#?}")`
///     if ctx.alternate() {
///         ctx.snippet_deferred(format!("Suggestion {idx}:\n  {val}"));
///     }
///
///     ctx.emit_deferred(format!("Suggestion ({idx})"));
/// });
///
/// // You can emit multiple lines from the same hook.
/// Report::install_debug_hook::<Warning>(|Warning(val), ctx| {
///     ctx.emit("Abnormal program execution detected");
///     ctx.emit(format!("Warning: {val}"));
/// });
///
/// // By not adding anything you are able to hide an attachment
/// // (it will still be counted towards opaque attachments)
/// Report::install_debug_hook::<Secret>(|_, _| {});
///
/// let report = Report::new(Error::from(ErrorKind::InvalidInput))
///     .attach(HttpResponseStatusCode(404))
///     .attach(Suggestion("Do you have a connection to the internet?"))
///     .attach(HttpResponseStatusCode(405))
///     .attach(Warning("Unable to determine environment"))
///     .attach(Secret("pssst, don't tell anyone else c;"))
///     .attach(Suggestion("Execute the program from the fish shell"))
///     .attach(HttpResponseStatusCode(501))
///     .attach(Suggestion("Try better next time!"));
///
/// # owo_colors::set_override(true);
/// # fn render(value: String) -> String {
/// #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
/// #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
/// #
/// #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
/// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
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
/// Report::install_debug_hook::<Computation>(|Computation(val), ctx| {
///     // Get a value of type `u64`, if we didn't insert one yet, default to 0
///     let mut acc = ctx.get::<u64>().copied().unwrap_or(0);
///     acc += *val;
///
///     // Get a value of type `f64`, if we didn't insert one yet, default to 1.0
///     let mut div = ctx.get::<f32>().copied().unwrap_or(1.0);
///     div /= *val as f32;
///
///     // Insert the calculated `u64` and `f32` back into storage, so that we can use them
///     // in the invocations following this one (for the same `Debug` call)
///     ctx.insert(acc);
///     ctx.insert(div);
///
///     ctx.emit(format!(
///         "Computation for {val} (acc = {acc}, div = {div})"
///     ));
/// });
///
/// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
///     .attach(Computation(2))
///     .attach(Computation(3));
///
/// # owo_colors::set_override(true);
/// # fn render(value: String) -> String {
/// #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
/// #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
/// #
/// #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
/// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
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
// TODO: ideally we would want to make `HookContextInner` private, as it is an implementation
//  detail, but "attribute privacy" as outlined in https://github.com/rust-lang/rust/pull/61969
//  is currently not implemented for repr(transparent).
#[repr(transparent)]
pub struct HookContext<T> {
    inner: HookContextInner,
    _marker: PhantomData<fn(&T)>,
}

impl<T> HookContext<T> {
    pub(crate) fn new(alternate: bool) -> Self {
        Self {
            inner: HookContextInner::new(alternate),
            _marker: PhantomData,
        }
    }

    pub(crate) fn append_snippet_string(&mut self, snippets: &mut Vec<String>) {
        self.inner.append_snippet_string(snippets);
    }

    pub(crate) fn snippet_strings(&self) -> &[String] {
        self.inner.snippet_strings()
    }

    /// This snippet (which can include line breaks) will be appended to the
    /// main message.
    ///
    /// This is useful for dense information like backtraces, or span traces.
    ///
    /// [`alternate()`]: Self::alternate
    /// [`Debug`]: core::fmt::Debug
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
    /// Report::install_debug_hook::<Error>(|Error { code, reason }, ctx| {
    ///     if ctx.alternate() {
    ///         // Add a snippet to the output
    ///         ctx.snippet(format!("Error {code}:\n  {reason}"));
    ///     }
    ///
    ///     ctx.emit(format!("Error {code}"));
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(Error {
    ///         code: 404,
    ///         reason: "Not Found - Server cannot find requested resource",
    ///     })
    ///     .attach(Error {
    ///         code: 405,
    ///         reason: "Bad Request - Server cannot or will not process request",
    ///     });
    ///
    /// # owo_colors::set_override(true);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
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
    pub fn snippet(&mut self, snippet: impl Into<String>) {
        self.inner.snippets.push(Emit::immediate(snippet));
    }

    /// Create a new multiline snippet, which is going to be appended to the end of the message, but
    /// deferred, until the end of the stack of current snippets.
    ///
    /// A stack are all attachments until a [`Context`] is encountered in the frame stack,
    /// lines added via this function are going to be emitted at the end.
    ///
    /// [`Context`]: crate::Context
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
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Error>(|Error { code, reason }, ctx| {
    ///     if ctx.alternate() {
    ///         // Add a snippet, which is printed after other snippets
    ///         ctx.snippet_deferred(format!("Error {code}:\n  {reason}"));
    ///     }
    ///
    ///     ctx.emit_deferred(format!("Error {code}"));
    /// });
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(suggestion), ctx| {
    ///     let idx = ctx.increment();
    ///
    ///     if ctx.alternate() {
    ///         ctx.snippet(format!("Suggestion {idx}:\n  {suggestion}"))
    ///     }
    ///
    ///     ctx.emit(format!("Suggestion ({idx})"));
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(Error {
    ///         code: 404,
    ///         reason: "Not Found - Server cannot find requested resource",
    ///     })
    ///     .attach(Error {
    ///         code: 405,
    ///         reason: "Bad Request - Server cannot or will not process request",
    ///     });
    ///
    /// # owo_colors::set_override(true);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_snippet_defer.snap")].assert_eq(&render(format!("{report:#?}")));
    /// #
    /// println!("{report:#?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_snippet_defer.snap"))]
    /// </pre>
    pub fn snippet_deferred(&mut self, snippet: impl Into<String>) {
        self.inner.snippets.push(Emit::defer(snippet));
    }

    /// Add a new line which is going to be emitted immediately.
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
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(val), ctx| {
    ///     ctx.emit(format!("Suggestion: {val}"));
    ///     // We can emit multiple lines in a single hook, these lines will be added one after
    ///     // another.
    ///     ctx.emit("Sorry for the inconvenience!");
    /// });
    ///
    /// let report = Report::new(io::Error::from(io::ErrorKind::InvalidInput))
    ///     .attach(Suggestion("Try better next time"));
    ///
    /// # owo_colors::set_override(true);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
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
    pub fn emit(&mut self, line: impl Into<String>) {
        self.inner.emits.push(Emit::immediate(line));
    }

    /// Create a new line, which is going to be deferred until the end of the current stack.
    ///
    /// A stack are all attachments until a [`Context`] is encountered in the frame stack,
    /// lines added via this function are going to be emitted at the end.
    ///
    /// [`Context`]: crate::Context
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
    /// struct ErrorCode(u64);
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(val), ctx| {
    ///     ctx.emit_deferred(format!("Suggestion: {val}"));
    /// });
    /// Report::install_debug_hook::<ErrorCode>(|ErrorCode(val), ctx| {
    ///     ctx.emit_deferred(format!("Error Code: {val}"));
    /// });
    ///
    /// let report = Report::new(io::Error::from(io::ErrorKind::InvalidInput))
    ///     .attach(Suggestion("Try better next time!"))
    ///     .attach(ErrorCode(404))
    ///     .attach(Suggestion("Try to use a different shell!"))
    ///     .attach(ErrorCode(405));
    ///
    /// # owo_colors::set_override(true);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__diagnostics_add_defer.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__diagnostics_add_defer.snap"))]
    /// </pre>
    pub fn emit_deferred(&mut self, line: impl Into<String>) {
        self.inner.emits.push(Emit::defer(line));
    }

    /// Cast the [`HookContext`] to a new type `U`.
    ///
    /// The storage of [`HookContext`] is partitioned, meaning that if `T` and `U` are different
    /// types the values stored in [`HookContext<T>`] will be separated from values in
    /// [`HookContext<U>`].
    ///
    /// In most situations this functions isn't needed, as it transparently casts between different
    /// partitions of the storage. Only hooks that share storage with hooks of different types
    /// should need to use this function.
    ///
    /// This function is also particularly useful when implementing generic fallbacks.
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
    /// struct Warning(&'static str);
    /// struct Error(&'static str);
    ///
    /// Report::install_debug_hook::<Error>(|Error(frame), ctx| {
    ///     let idx = ctx.increment() + 1;
    ///
    ///     ctx.emit(format!("[{idx}] [ERROR] {frame}"));
    /// });
    /// Report::install_debug_hook::<Warning>(|Warning(frame), ctx| {
    ///     // We want to share the same counter with `Error`, so that we're able to have
    ///     // a global counter to keep track of all errors and warnings in order, this means
    ///     // we need to access the storage of `Error` using `cast()`.
    ///     let ctx = ctx.cast::<Error>();
    ///     let idx = ctx.increment() + 1;
    ///     ctx.emit(format!("[{idx}] [WARN] {frame}"))
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(Error("Unable to reach remote host"))
    ///     .attach(Warning("Disk nearly full"))
    ///     .attach(Error("Cannot resolve example.com: Unknown host"));
    ///
    /// # owo_colors::set_override(true);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_cast.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_cast.snap"))]
    /// </pre>
    #[must_use]
    pub fn cast<U>(&mut self) -> &mut HookContext<U> {
        // SAFETY: `HookContext` is marked as repr(transparent) and the generic is only used inside
        // of the `PhantomData`
        unsafe { &mut *(self as *mut Self).cast::<HookContext<U>>() }
    }

    /// Returns if the currently requested format should render the alternate representation.
    ///
    /// This corresponds to the output of [`std::fmt::Formatter::alternate`].
    #[must_use]
    pub const fn alternate(&self) -> bool {
        self.inner.alternate()
    }

    fn storage(&self) -> &Storage {
        self.inner.storage()
    }

    fn storage_mut(&mut self) -> &mut Storage {
        self.inner.storage_mut()
    }

    pub(crate) fn take_emits(&mut self) -> (Vec<Emit>, Vec<Emit>) {
        self.inner.take_emits()
    }
}

impl<T: 'static> HookContext<T> {
    /// Return a reference to a value of type `U`, if a value of that type exists.
    ///
    /// Values returned are isolated and therefore "bound" to `T`, this means that if two different
    /// [`HookContext`]s that share the same inner value (e.g. same invocation of [`Debug`]) will
    /// return the same value.
    ///
    /// [`Debug`]: core::fmt::Debug
    #[must_use]
    pub fn get<U: 'static>(&self) -> Option<&U> {
        self.storage()
            .get(&TypeId::of::<T>())?
            .get(&TypeId::of::<U>())?
            .downcast_ref()
    }

    /// Return a mutable reference to a value of type `U`, if a value of that type exists.
    ///
    /// Values returned are isolated and therefore "bound" to `T`, this means that if two different
    /// [`HookContext`]s that share the same inner value (e.g. same invocation of [`Debug`]) will
    /// return the same value.
    pub fn get_mut<U: 'static>(&mut self) -> Option<&mut U> {
        self.storage_mut()
            .get_mut(&TypeId::of::<T>())?
            .get_mut(&TypeId::of::<U>())?
            .downcast_mut()
    }

    /// Insert a new value of type `U` into the storage of [`HookContext`].
    ///
    /// The returned value will the previously stored value of the same type `U` scoped over type
    /// `T`, if it existed, did no such value exist it will return [`None`].
    pub fn insert<U: 'static>(&mut self, value: U) -> Option<U> {
        self.storage_mut()
            .entry(TypeId::of::<T>())
            .or_default()
            .insert(TypeId::of::<U>(), Box::new(value))?
            .downcast()
            .map(|boxed| *boxed)
            .ok()
    }

    /// Remove the value of type `U` from the storage of [`HookContext`] if it existed.
    ///
    /// The returned value will be the previously stored value of the same type `U`.
    pub fn remove<U: 'static>(&mut self) -> Option<U> {
        self.storage_mut()
            .get_mut(&TypeId::of::<T>())?
            .remove(&TypeId::of::<U>())?
            .downcast()
            .map(|boxed| *boxed)
            .ok()
    }

    /// One of the most common interactions with [`HookContext`] is a counter to reference previous
    /// frames or the content emitted during [`HookContext::snippet`].
    ///
    /// This is a utility method, which uses the other primitive methods provided to automatically
    /// increment a counter, if the counter wasn't initialized this method will return `0`.
    ///
    /// ```rust
    /// # // we only test with Rust 1.65, which means that `render()` is unused on earlier version
    /// # #![cfg_attr(not(rust_1_65), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io::ErrorKind;
    ///
    /// use error_stack::Report;
    ///
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(val), ctx| {
    ///     let idx = ctx.increment();
    ///     ctx.emit(format!("Suggestion {idx}: {val}"));
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(Suggestion("Use a file you can read next time!"))
    ///     .attach(Suggestion("Don't press any random keys!"));
    ///
    /// # owo_colors::set_override(true);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_increment.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_increment.snap"))]
    /// </pre>
    ///
    /// [`Debug`]: core::fmt::Debug
    pub fn increment(&mut self) -> isize {
        let counter = self.get_mut::<isize>();

        match counter {
            None => {
                // if the counter hasn't been set yet, default to `0`
                self.insert(0isize);

                0
            }
            Some(ctr) => {
                *ctr += 1;

                *ctr
            }
        }
    }

    /// One of the most common interactions with [`HookContext`] is a counter
    /// to reference previous frames or the content emitted during [`HookContext::snippet`].
    ///
    /// This is a utility method, which uses the other primitive method provided to automatically
    /// decrement a counter, if the counter wasn't initialized this method will return `-1` to stay
    /// consistent with [`increment()`].
    ///
    /// ```rust
    /// # // we only test with Rust 1.65, which means that `render()` is unused on earlier version
    /// # #![cfg_attr(not(rust_1_65), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io::ErrorKind;
    ///
    /// use error_stack::Report;
    ///
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(val), ctx| {
    ///     let idx = ctx.decrement();
    ///     ctx.emit(format!("Suggestion {idx}: {val}"));
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(Suggestion("Use a file you can read next time!"))
    ///     .attach(Suggestion("Don't press any random keys!"));
    ///
    /// # owo_colors::set_override(true);
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_decrement.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_decrement.snap"))]
    /// </pre>
    ///
    /// [`increment()`]: Self::increment
    pub fn decrement(&mut self) -> isize {
        let counter = self.get_mut::<isize>();

        match counter {
            None => {
                // given that increment starts with `0` (which is therefore the implicit default
                // value) decrementing the default value results in `-1`,
                // which is why we output that value.
                self.insert(-1_isize);

                -1
            }
            Some(ctr) => {
                *ctr -= 1;
                *ctr
            }
        }
    }
}

type BoxedHook = Box<dyn Fn(&Frame, &mut HookContext<Frame>) -> Option<()> + Send + Sync>;
type BoxedFallbackHook = Box<dyn Fn(&Frame, &mut HookContext<Frame>) + Send + Sync>;

fn into_boxed_hook<T: Send + Sync + 'static>(
    hook: impl Fn(&T, &mut HookContext<T>) + Send + Sync + 'static,
) -> BoxedHook {
    Box::new(move |frame: &Frame, ctx: &mut HookContext<Frame>| {
        #[cfg(nightly)]
        {
            frame
                .request_ref::<T>()
                .map(|val| hook(val, ctx.cast()))
                .or_else(|| {
                    frame
                        .request_value::<T>()
                        .as_ref()
                        .map(|val| hook(val, ctx.cast()))
                })
        }

        #[cfg(not(nightly))]
        {
            frame.downcast_ref::<T>().map(|val| hook(val, ctx.cast()))
        }
    })
}

/// Holds list of hooks and a fallback.
///
/// The fallback is called whenever a hook for a specific type couldn't be found.
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
/// [`Frame`]: crate::Frame
/// [`.insert()`]: Hooks::insert
#[cfg(feature = "std")]
pub(crate) struct Hooks {
    // We use `Vec`, instead of `HashMap` or `BTreeMap`, so that ordering is consistent with the
    // insertion order of types.
    pub(crate) inner: Vec<(TypeId, BoxedHook)>,
    pub(crate) fallback: Option<BoxedFallbackHook>,
}

#[cfg(feature = "std")]
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

    pub(crate) fn fallback(
        &mut self,
        hook: impl Fn(&Frame, &mut HookContext<Frame>) + Send + Sync + 'static,
    ) {
        self.fallback = Some(Box::new(hook));
    }

    pub(crate) fn call(&self, frame: &Frame, ctx: &mut HookContext<Frame>) {
        // by checking the times we actually invoked a function we make sure that
        // even if we only emit snippets, or have purposely not emitted anything don't use the
        // fallback.
        let calls = self
            .inner
            .iter()
            .filter_map(|(_, hook)| hook(frame, ctx))
            .count();

        if calls == 0 {
            if let Some(fallback) = &self.fallback {
                fallback(frame, ctx);
            }
        }
    }
}

mod default {
    #![allow(unused_imports)]

    #[cfg(any(rust_1_65, feature = "spantrace"))]
    use alloc::format;
    use alloc::{vec, vec::Vec};
    use core::any::TypeId;
    #[cfg(rust_1_65)]
    use std::backtrace::Backtrace;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Once,
    };

    #[cfg(feature = "spantrace")]
    use tracing_error::SpanTrace;

    use crate::{
        fmt::{
            hook::{into_boxed_hook, BoxedHook, HookContext},
            Emit,
        },
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
        static INSTALL_BUILTIN_RUNNING: AtomicBool = AtomicBool::new(false);

        // This has minimal overhead, as `Once::call_once` calls `.is_completed` as the short path
        // we just move it out here, so that we're able to check `INSTALL_BUILTIN_RUNNING`
        if INSTALL_BUILTIN.is_completed() || INSTALL_BUILTIN_RUNNING.load(Ordering::Acquire) {
            return;
        }

        INSTALL_BUILTIN.call_once(|| {
            INSTALL_BUILTIN_RUNNING.store(true, Ordering::Release);

            #[cfg(all(rust_1_65))]
            Report::install_debug_hook(backtrace);

            #[cfg(feature = "spantrace")]
            Report::install_debug_hook(span_trace);
        });
    }

    #[cfg(rust_1_65)]
    fn backtrace(backtrace: &Backtrace, ctx: &mut HookContext<Backtrace>) {
        let idx = ctx.increment();

        ctx.snippet_deferred(format!("Backtrace No. {}\n{}", idx + 1, backtrace));
        ctx.emit_deferred(format!(
            "backtrace with {} frames ({})",
            backtrace.frames().len(),
            idx + 1
        ));
    }

    #[cfg(feature = "spantrace")]
    fn span_trace(spantrace: &SpanTrace, ctx: &mut HookContext<SpanTrace>) {
        let idx = ctx.increment();

        let mut span = 0;
        spantrace.with_spans(|_, _| {
            span += 1;
            true
        });

        ctx.snippet_deferred(format!("Span Trace No. {}\n{}", idx + 1, spantrace));
        ctx.emit_deferred(format!("spantrace with {span} frames ({})", idx + 1));
    }
}

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

use crate::fmt::Frame;

type Storage = BTreeMap<TypeId, BTreeMap<TypeId, Box<dyn Any>>>;

/// Private struct which is used to hold the information about the current count for every type.
/// This is used so that others cannot interfere with the counter and ensure that there's no
/// unexpected behavior.
struct Counter(isize);

impl Counter {
    const fn new(value: isize) -> Self {
        Self(value)
    }

    const fn as_inner(&self) -> isize {
        self.0
    }

    fn increment(&mut self) {
        self.0 += 1;
    }

    fn decrement(&mut self) {
        self.0 -= 1;
    }
}

#[derive(Debug)]
pub(crate) struct HookContextInner {
    storage: Storage,

    alternate: bool,

    body: Vec<String>,
    appendix: Vec<String>,
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

    fn take_body(&mut self) -> Vec<String> {
        mem::take(&mut self.body)
    }
}

impl HookContextInner {
    fn new(alternate: bool) -> Self {
        Self {
            storage: Storage::default(),
            body: Vec::new(),
            appendix: Vec::new(),
            alternate,
        }
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

    pub(crate) fn appendix(&self) -> &[String] {
        &self.inner.appendix
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
        self.inner.appendix.push(content.into());
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
        self.inner.body.push(content.into());
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
    /// Report::install_debug_hook::<Error>(|Error(frame), context| {
    ///     let idx = context.increment_counter() + 1;
    ///
    ///     context.push_body(format!("[{idx}] [ERROR] {frame}"));
    /// });
    /// Report::install_debug_hook::<Warning>(|Warning(frame), context| {
    ///     // We want to share the same counter with `Error`, so that we're able to have
    ///     // a global counter to keep track of all errors and warnings in order, this means
    ///     // we need to access the storage of `Error` using `cast()`.
    ///     let context = context.cast::<Error>();
    ///     let idx = context.increment_counter() + 1;
    ///     context.push_body(format!("[{idx}] [WARN] {frame}"))
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(Error("unable to reach remote host"))
    ///     .attach(Warning("disk nearly full"))
    ///     .attach(Error("cannot resolve example.com: unknown host"));
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

    pub(crate) fn take_body(&mut self) -> Vec<String> {
        self.inner.take_body()
    }
}

impl<T: 'static> HookContext<T> {
    /// Return a reference to a value of type `U`, if a value of that type exists.
    ///
    /// Values returned are isolated and "bound" to `T`, this means that [`HookContext<Warning>`]
    /// and [`HookContext<Error>`] do not share the same values. Values are only retained during the
    /// invocation of [`Debug`].
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
    /// Values returned are isolated and "bound" to `T`, this means that [`HookContext<Warning>`]
    /// and [`HookContext<Error>`] do not share the same values. Values are only retained during the
    /// invocation of [`Debug`].
    ///
    /// [`Debug`]: core::fmt::Debug
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
    /// The returned value will be the previously stored value of the same type `U` if it existed in
    /// the scope of `T`, did no such value exist, it will return [`None`].
    pub fn remove<U: 'static>(&mut self) -> Option<U> {
        self.storage_mut()
            .get_mut(&TypeId::of::<T>())?
            .remove(&TypeId::of::<U>())?
            .downcast()
            .map(|boxed| *boxed)
            .ok()
    }

    /// One of the most common interactions with [`HookContext`] is a counter to reference previous
    /// frames in an entry to the appendix that was added using [`HookContext::push_appendix`].
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
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(value), context| {
    ///     let idx = context.increment_counter();
    ///     context.push_body(format!("suggestion {idx}: {value}"));
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(Suggestion("use a file you can read next time!"))
    ///     .attach(Suggestion("don't press any random keys!"));
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
    pub fn increment_counter(&mut self) -> isize {
        let counter = self.get_mut::<Counter>();

        // reason: This would fail as we cannot move out of `self` because it is borrowed
        #[allow(clippy::option_if_let_else)]
        match counter {
            None => {
                // if the counter hasn't been set yet, default to `0`
                self.insert(Counter::new(0));

                0
            }
            Some(ctr) => {
                ctr.increment();

                ctr.as_inner()
            }
        }
    }

    /// One of the most common interactions with [`HookContext`] is a counter to reference previous
    /// frames in an entry to the appendix that was added using [`HookContext::push_appendix`].
    ///
    /// This is a utility method, which uses the other primitive method provided to automatically
    /// decrement a counter, if the counter wasn't initialized this method will return `-1` to stay
    /// consistent with [`HookContext::increment_counter`].
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
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(value), context| {
    ///     let idx = context.decrement_counter();
    ///     context.push_body(format!("suggestion {idx}: {value}"));
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(Suggestion("use a file you can read next time!"))
    ///     .attach(Suggestion("don't press any random keys!"));
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
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_decrement.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_decrement.snap"))]
    /// </pre>
    pub fn decrement_counter(&mut self) -> isize {
        let counter = self.get_mut::<Counter>();

        // reason: This would fail as we cannot move out of `self` because it is borrowed
        #[allow(clippy::option_if_let_else)]
        match counter {
            None => {
                // given that increment starts with `0` (which is therefore the implicit default
                // value) decrementing the default value results in `-1`,
                // which is why we output that value.
                self.insert(Counter::new(-1));

                -1
            }
            Some(ctr) => {
                ctr.decrement();

                ctr.as_inner()
            }
        }
    }
}

type BoxedHook = Box<dyn Fn(&Frame, &mut HookContext<Frame>) -> Option<()> + Send + Sync>;

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
        }

        // emulate the behavior from nightly by searching for
        //  - `Context::provide`: not available
        //  - `Attachment`s: provide themself, emulated by `downcast_ref`
        #[cfg(not(nightly))]
        matches!(frame.kind(), crate::FrameKind::Attachment(_))
            .then_some(frame)
            .and_then(Frame::downcast_ref::<T>)
            .map(|value| hook(value, context.cast()))
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
/// [`Frame`]: crate::Frame
/// [`.insert()`]: Hooks::insert
#[cfg(feature = "std")]
pub(crate) struct Hooks {
    // We use `Vec`, instead of `HashMap` or `BTreeMap`, so that ordering is consistent with the
    // insertion order of types.
    pub(crate) inner: Vec<(TypeId, BoxedHook)>,
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

    pub(crate) fn call(&self, frame: &Frame, context: &mut HookContext<Frame>) {
        for (_, hook) in &self.inner {
            hook(frame, context);
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
        static INSTALL_BUILTIN_RUNNING: AtomicBool = AtomicBool::new(false);

        // This has minimal overhead, as `Once::call_once` calls `.is_completed` as the short path
        // we just move it out here, so that we're able to check `INSTALL_BUILTIN_RUNNING`
        if INSTALL_BUILTIN.is_completed() || INSTALL_BUILTIN_RUNNING.load(Ordering::Acquire) {
            return;
        }

        INSTALL_BUILTIN.call_once(|| {
            INSTALL_BUILTIN_RUNNING.store(true, Ordering::Release);

            #[cfg(rust_1_65)]
            Report::install_debug_hook(backtrace);

            #[cfg(feature = "spantrace")]
            Report::install_debug_hook(span_trace);
        });
    }

    #[cfg(rust_1_65)]
    fn backtrace(backtrace: &Backtrace, context: &mut HookContext<Backtrace>) {
        let idx = context.increment_counter();

        context.push_appendix(format!("backtrace no. {}\n{}", idx + 1, backtrace));
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

        context.push_appendix(format!("span trace No. {}\n{}", idx + 1, span_trace));
        context.push_body(format!("span trace with {span} frames ({})", idx + 1));
    }
}

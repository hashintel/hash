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

pub use default::builtin_debug_hook_fallback;

use crate::fmt::{Emit, Frame};

#[derive(Default)]
pub(crate) struct HookContextImpl {
    pub(crate) snippets: Vec<String>,
    alternate: bool,

    storage: BTreeMap<TypeId, BTreeMap<TypeId, Box<dyn Any>>>,
}

impl HookContextImpl {
    pub(crate) fn new(alternate: bool) -> Self {
        Self {
            snippets: Vec::new(),
            alternate,
            storage: BTreeMap::new(),
        }
    }

    pub(crate) fn as_hook_context<T>(&mut self) -> HookContext<'_, T> {
        HookContext {
            parent: self,
            _marker: PhantomData::default(),
        }
    }
}

/// Carrier for contextual information used across hook invocations.
///
/// `HookContext` has two fundamental use-cases:
/// 1) Emitting Snippets
/// 2) Storage
///
/// ## Emitting Snippets
///
/// A [`Debug`] backtrace consists of two different sections, a rendered tree of objects and
/// additional text/information that is too large to fit into the tree.
///
/// Snippets can be added to the current output via [`attach_snippet()`].
///
/// [`attach_snippet()`]: HookContext::attach_snippet
/// [`Debug`]: core::fmt::Debug
///
/// ### Example
///
/// ```rust
/// # // we only test on nightly, therefore report is unused (so is render)
/// # #![cfg_attr(not(nightly), allow(dead_code, unused_variables, unused_imports))]
/// use std::io::ErrorKind;
///
/// use error_stack::{fmt::Emit, Report};
///
/// struct Error {
///     code: usize,
///     reason: &'static str,
/// }
///
/// Report::install_debug_hook::<Error>(|Error { code, reason }, ctx| {
///     if ctx.alternate() {
///         ctx.attach_snippet(format!("Error {code}:\n  {reason}"));
///     }
///
///     vec![Emit::next(format!("Error {code}"))]
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
/// # #[cfg(nightly)]
/// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_emit.snap")].assert_eq(&render(format!("{report:#?}")));
/// #
/// println!("{report:#?}");
/// ```
///
/// <pre>
#[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_emit.snap"))]
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
/// # // we only test on nightly, therefore report is unused (so is render)
/// # #![cfg_attr(not(nightly), allow(dead_code, unused_variables, unused_imports))]
/// use std::io::ErrorKind;
///
/// use error_stack::{fmt::Emit, Report};
///
/// struct Computation(u64);
///
/// Report::install_debug_hook::<Computation>(|Computation(val), ctx| {
///     let mut acc = ctx.get::<u64>().copied().unwrap_or(0);
///     acc += *val;
///
///     let mut div = ctx.get::<f32>().copied().unwrap_or(1.0);
///     div /= *val as f32;
///
///     ctx.insert(acc);
///
///     vec![Emit::next(format!(
///         "Computation for {val} (acc = {acc}, div = {div})"
///     ))]
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
/// # #[cfg(nightly)]
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
#[repr(transparent)]
pub struct HookContext<'a, T> {
    parent: &'a mut HookContextImpl,
    _marker: PhantomData<T>,
}

impl<T> HookContext<'_, T> {
    /// This snippet (which can include line breaks) will be appended to the
    /// main message.
    ///
    /// This is useful for dense information like backtraces, or span traces.
    ///
    /// [`alternate()`]: Self::alternate
    /// [`Debug`]: core::fmt::Debug
    pub fn attach_snippet(&mut self, snippet: impl Into<String>) {
        self.parent.snippets.push(snippet.into());
    }
}

impl<'a, T> HookContext<'a, T> {
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
    /// # // we only test on nightly, therefore report is unused (so is render)
    /// # #![cfg_attr(not(nightly), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io::ErrorKind;
    ///
    /// use error_stack::{
    ///     fmt::Emit,
    ///     Report,
    /// };
    ///
    /// struct Warning(&'static str);
    /// struct Error(&'static str);
    ///
    /// Report::install_debug_hook::<Error>(|Error(frame), ctx| {
    ///     vec![Emit::next(format!(
    ///         "[{}] [ERROR] {frame}",
    ///         ctx.increment() + 1
    ///     ))]
    /// });
    /// Report::install_debug_hook::<Warning>(|Warning(frame), ctx| {
    ///     vec![Emit::next(format!(
    ///         "[{}] [WARN] {frame}",
    ///         ctx.cast::<Error>().increment() + 1
    ///     ))]
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
    /// # #[cfg(nightly)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_cast.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_cast.snap"))]
    /// </pre>
    #[must_use]
    pub fn cast<U>(&mut self) -> &mut HookContext<'a, U> {
        // SAFETY: `HookContext` is marked as repr(transparent) and the generic is only used inside
        // of the `PhantomData`
        unsafe { &mut *(self as *mut HookContext<T>).cast::<HookContext<U>>() }
    }

    /// Returns if the currently requested format should render the alternate representation.
    ///
    /// This corresponds to the output of [`std::fmt::Formatter::alternate`].
    #[must_use]
    pub fn alternate(&self) -> bool {
        self.parent.alternate
    }
}

impl<T: 'static> HookContext<'_, T> {
    /// Return a reference to a value of type `U`, if a value of that type exists.
    ///
    /// Values returned are isolated and therefore "bound" to `T`, this means that if two different
    /// [`HookContext`]s that share the same inner value (e.g. same invocation of [`Debug`]) will
    /// return the same value.
    ///
    /// [`Debug`]: core::fmt::Debug
    #[must_use]
    pub fn get<U: 'static>(&self) -> Option<&U> {
        self.parent
            .storage
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
        self.parent
            .storage
            .get_mut(&TypeId::of::<T>())?
            .get_mut(&TypeId::of::<U>())?
            .downcast_mut()
    }

    /// Insert a new value of type `U` into the storage of [`HookContext`].
    ///
    /// The returned value will the previously stored value of the same type `U` scoped over type
    /// `T`, if it existed, did no such value exist it will return [`None`].
    pub fn insert<U: 'static>(&mut self, value: U) -> Option<U> {
        self.parent
            .storage
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
        self.parent
            .storage
            .get_mut(&TypeId::of::<T>())?
            .remove(&TypeId::of::<U>())?
            .downcast()
            .map(|boxed| *boxed)
            .ok()
    }

    /// One of the most common interactions with [`HookContext`] is a counter to reference previous
    /// frames or the content emitted during [`attach_snippet()`].
    ///
    /// This is a utility method, which uses the other primitive methods provided to automatically
    /// increment a counter, if the counter wasn't initialized this method will return `0`.
    ///
    /// ```rust
    /// # // we only test on nightly, therefore report is unused (so is render)
    /// # #![cfg_attr(not(nightly), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io::ErrorKind;
    ///
    /// use error_stack::fmt::Emit;
    /// use error_stack::Report;
    ///
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(val), ctx| {
    ///     vec![Emit::next(format!("Suggestion {}: {val}", ctx.increment()))]
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
    /// # #[cfg(nightly)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_increment.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__hookcontext_increment.snap"))]
    /// </pre>
    ///
    /// [`attach_snippet()`]: Self::attach_snippet
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
    /// to reference previous frames or the content emitted during [`attach_snippet()`].
    ///
    /// This is a utility method, which uses the other primitive method provided to automatically
    /// decrement a counter, if the counter wasn't initialized this method will return `-1` to stay
    /// consistent with [`increment()`].
    ///
    /// ```rust
    /// # // we only test on nightly, therefore report is unused (so is render)
    /// # #![cfg_attr(not(nightly), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io::ErrorKind;
    ///
    /// use error_stack::{fmt::Emit, Report};
    ///
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(val), ctx| {
    ///     vec![Emit::next(format!("Suggestion {}: {val}", ctx.decrement()))]
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
    /// # #[cfg(nightly)]
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
    /// [`attach_snippet()`]: Self::attach_snippet
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

type BoxedHook =
    Box<dyn for<'a> Fn(&Frame, &mut HookContext<'a, Frame>) -> Vec<Emit> + Send + Sync>;

/// Holds list of hooks and a fallback.
///
/// The fallback is called whenever a hook for a specific type couldn't be found.
///
/// These are used to augment the [`Debug`] and [`Display`] information
/// of attachments, which are normally not printable.
///
/// Hooks are added via [`.insert()`], which will wrap the function in an additional closure.
/// This closure will downcast the [`Frame`] to the requested type.
///
/// If not set, opaque attachments (added via [`.attach()`]) won't be rendered in the [`Debug`] and
/// [`Display`] output.
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
#[allow(clippy::redundant_pub_crate)]
pub(crate) struct Hooks {
    // TODO: Remove `Option` when const `BTreeMap::new` is stabilized
    pub(crate) inner: Option<BTreeMap<TypeId, BoxedHook>>,
    pub(crate) fallback: Option<BoxedHook>,
}

#[cfg(feature = "std")]
impl Hooks {
    pub(crate) fn insert<T: Send + Sync + 'static>(
        &mut self,
        hook: impl for<'a> Fn(&T, &mut HookContext<'a, T>) -> Vec<Emit> + Send + Sync + 'static,
    ) {
        let inner = self.inner.get_or_insert_with(BTreeMap::new);

        inner.insert(
            TypeId::of::<T>(),
            Box::new(move |frame, ctx| {
                // `.unwrap()` never fails here, because `Hooks` guarantees the function will never
                // be called on an object which cannot be downcast.
                let frame = frame.downcast_ref::<T>().unwrap();

                hook(frame, ctx.cast())
            }),
        );
    }

    pub(crate) fn fallback(
        &mut self,
        hook: impl for<'a> Fn(&Frame, &mut HookContext<'a, Frame>) -> Vec<Emit> + Send + Sync + 'static,
    ) {
        self.fallback = Some(Box::new(hook));
    }

    pub(crate) fn call<'a>(&self, frame: &Frame, ctx: &mut HookContext<'a, Frame>) -> Vec<Emit> {
        let ty = Frame::type_id(frame);

        if let Some(hook) = self.inner.as_ref().and_then(|map| map.get(&ty)) {
            hook(frame, ctx)
        } else if let Some(fallback) = self.fallback.as_ref() {
            fallback(frame, ctx)
        } else {
            builtin_debug_hook_fallback(frame, ctx)
        }
    }
}

mod default {
    #![allow(unused_imports)]

    #[cfg(any(all(nightly, feature = "std"), feature = "spantrace"))]
    use alloc::format;
    use alloc::{vec, vec::Vec};
    #[cfg(all(nightly, feature = "std"))]
    use std::backtrace::Backtrace;

    #[cfg(feature = "spantrace")]
    use tracing_error::SpanTrace;

    use crate::{
        fmt::{hook::HookContext, Emit},
        Frame,
    };

    #[cfg(all(nightly, feature = "std"))]
    fn backtrace(backtrace: &Backtrace, ctx: &mut HookContext<Backtrace>) -> Vec<Emit> {
        let idx = ctx.increment();

        ctx.attach_snippet(format!("Backtrace No. {}\n{}", idx + 1, backtrace));

        vec![Emit::defer(format!(
            "backtrace with {} frames ({})",
            backtrace.frames().len(),
            idx + 1
        ))]
    }

    #[cfg(feature = "spantrace")]
    fn span_trace(spantrace: &SpanTrace, ctx: &mut HookContext<SpanTrace>) -> Vec<Emit> {
        let idx = ctx.increment();

        let mut span = 0;
        spantrace.with_spans(|_, _| {
            span += 1;
            true
        });

        ctx.attach_snippet(format!("Span Trace No. {}\n{}", idx + 1, spantrace));

        vec![Emit::defer(format!(
            "spantrace with {span} frames ({})",
            idx + 1
        ))]
    }

    /// Fallback for common attachments that are automatically created
    /// by `error_stack`, like [`Backtrace`] and [`SpanTrace`]
    ///
    /// [`Backtrace`]: std::backtrace::Backtrace
    /// [`SpanTrace`]: tracing_error::SpanTrace
    // Frame can be unused, if neither backtrace or spantrace are enabled
    #[allow(unused_variables)]
    pub fn builtin_debug_hook_fallback<'a>(
        frame: &Frame,
        ctx: &mut HookContext<'a, Frame>,
    ) -> Vec<Emit> {
        #[allow(unused_mut)]
        let mut emit = vec![];

        // we're only able to use `request_ref` in nightly, because the Provider API hasn't been
        // stabilized yet.
        #[cfg(nightly)]
        {
            #[cfg(feature = "std")]
            if let Some(bt) = frame.request_ref() {
                emit.append(&mut backtrace(bt, ctx.cast()));
            }

            #[cfg(feature = "spantrace")]
            if let Some(st) = frame.request_ref() {
                emit.append(&mut span_trace(st, ctx.cast()));
            }
        }

        #[cfg(not(nightly))]
        {
            #[cfg(feature = "spantrace")]
            if let Some(st) = frame.downcast_ref() {
                emit.append(&mut span_trace(st, ctx.cast()));
            }
        }

        emit
    }
}

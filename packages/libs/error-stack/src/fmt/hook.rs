// We allow dead-code here, because some of the functions are only exposed when `feature = "hooks"`
// we could do cfg for everything, but that gets very messy, instead we only use a subset
// and enable deadcode on `feature = "hooks"`.
#![cfg_attr(not(feature = "hooks"), allow(dead_code))]

use alloc::{boxed::Box, collections::BTreeMap, vec::Vec};
use core::{
    any::{Any, TypeId},
    marker::PhantomData,
};

pub use default::builtin;

use crate::fmt::{Emit, Frame, Snippet};

#[derive(Default)]
pub struct HookContextImpl {
    pub(crate) snippets: Vec<Snippet>,
    alternate: bool,

    storage: BTreeMap<TypeId, BTreeMap<TypeId, Box<dyn Any>>>,
}

impl HookContextImpl {
    pub(crate) fn cast<T>(&mut self) -> HookContext<T> {
        HookContext {
            parent: self,
            _marker: PhantomData::default(),
        }
    }

    pub(crate) const fn alternate(&self) -> bool {
        self.alternate
    }
}

/// Optional context used to carry information across hook invocations.
///
/// `HookContext` has two fundamental use-cases:
/// 1) Emitting [`Snippet`]s
/// 2) Storage
///
/// ## Emitting [`Snippet`]s
///
/// A [`Debug`] backtrace consists of two different sections, a rendered tree of objects and
/// additional text/information that is too large to fit into the tree.
///
/// [`Snippet`]s can be added to the current output via [`add_snippet()`],
/// depending on the type of the snippet, these text fragments are either always outputted, or just
/// when alternate mode (`:#?`) has been enabled.
///
/// [`add_snippet()`]: HookContext::add_snippet
///
/// ### Example
///
/// ```rust
/// use std::io::ErrorKind;
///
/// use error_stack::{fmt::{Emit, Snippet}, Report};
///
/// Report::install_debug_hook::<u64>(|val, ctx| {
///     ctx.add_snippet(Snippet::regular("u64 has been encountered"));
///     Emit::next(val.to_string())
/// });
///
/// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
///     .attach(2u64)
///     .attach(3u64);
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
/// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/snapshots/fmt__hookcontext_emit.snap")].assert_eq(&render(format!("{report:#?}")));
/// #
/// # stringify!(
/// println!("{report:#?}");
/// # );
/// ```
///
/// <pre>
#[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/snapshots/fmt__hookcontext_emit.snap"))]
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
/// ```rust
/// use std::io::ErrorKind;
///
/// use error_stack::{fmt::Emit, Report};
///
///
/// Report::install_debug_hook::<u64>(|val, ctx| {
///     let mut acc = ctx.get::<u64>().copied().unwrap_or(0);
///     acc += *val;
///
///     let mut div = ctx.get::<f32>().copied().unwrap_or(1.0);
///     div /= *val as f32;
///
///     ctx.insert(acc);
///
///     Emit::next(format!("{val} (acc: {acc}, div: {div})"))
/// });
///
/// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
///     .attach(2u64)
///     .attach(3u64);
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
/// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/snapshots/fmt__hookcontext_storage.snap")].assert_eq(&render(format!("{report:?}")));
/// #
/// # stringify!(
/// println!("{report:?}");
/// # );
/// ```
///
/// <pre>
#[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/snapshots/fmt__hookcontext_storage.snap"))]
/// </pre>
#[cfg_attr(all(doc, nightly), doc(cfg(feature = "hooks")))]
pub struct HookContext<'a, T> {
    parent: &'a mut HookContextImpl,
    _marker: PhantomData<T>,
}

#[cfg_attr(all(doc, nightly), doc(cfg(feature = "hooks")))]
impl<T> HookContext<'_, T> {
    /// If [`Debug`] requests, this snippet (which can include line breaks) will be appended to the
    /// main message.
    ///
    /// A hook can force the append of a snippet by using [`Snippet::Force`],
    /// [`Snippet::Regular`] will only be appended if [`alternate()`] is requested.
    ///
    /// This is useful for dense information like backtraces, or span traces, which are omitted when
    /// rendering without the alternate [`Debug`] output.
    ///
    /// [`alternate()`]: Self::alternate
    pub fn add_snippet(&mut self, snippet: Snippet) {
        self.parent.snippets.push(snippet)
    }
}

#[cfg_attr(all(doc, nightly), doc(cfg(feature = "hooks")))]
impl<'a, T> HookContext<'a, T> {
    /// Cast the [`HookContext`] to a new type `U`.
    ///
    /// The storage of [`HookContext`] is partitioned, meaning that if `T` and `U` are different
    /// types the values stored in [`HookContext<T>`] will be separated from values in
    /// [`HookContext<U>`].
    ///
    /// Most user-facing should never need to use this function, as function hooks are only able to
    /// get a mutable reference to [`HookContext`].
    /// This is not the case for a fallback function, which receives the context as value,
    /// allowing for "dynamic" recasting.
    ///
    /// ### Example
    ///
    /// ```rust
    /// use std::io::ErrorKind;
    ///
    /// use error_stack::{fmt, fmt::Emit, Report};
    /// use error_stack::fmt::Call;
    ///
    /// struct Value(u64);
    ///
    /// Report::install_debug_hook_fallback(|frame, ctx| {
    ///     fmt::builtin(frame, ctx)
    ///         .or_else(|ctx| match frame.downcast_ref::<Value>() {
    ///             None => Call::Miss(ctx),
    ///             Some(_) => {
    ///                 // the inner value of `Value` is always `u64`,
    ///                 // we therefore only "mask" u64 and want to use the same incremental value.
    ///                 let mut ctx = ctx.cast::<u64>();
    ///                 Call::Find(Emit::next(format!("{} (Value)", ctx.increment())))
    ///             }
    ///         })
    ///         .cast()
    /// });
    ///
    /// Report::install_debug_hook::<u64>(|_, ctx| Emit::next(format!("{}", ctx.increment())));
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(1u64)
    ///     .attach(Value(2u64))
    ///     .attach(3u64);
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
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/snapshots/fmt__hookcontext_cast.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// # stringify!(
    /// println!("{report:?}");
    /// # );
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/snapshots/fmt__hookcontext_cast.snap"))]
    /// </pre>
    #[must_use]
    pub fn cast<U>(self) -> HookContext<'a, U> {
        HookContext {
            parent: self.parent,
            _marker: PhantomData::default(),
        }
    }

    /// Is the currently requested format the alternate representation?
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
    /// frames or the content emitted during [`add_snippet()`].
    ///
    /// This is a utility method, which uses the other primitive methods provided to automatically
    /// increment a counter, if the counter wasn't initialized this method will return `0`.
    ///
    /// ```rust
    /// use std::io::ErrorKind;
    ///
    /// use error_stack::fmt::Emit;
    /// use error_stack::Report;
    ///
    ///
    /// Report::install_debug_hook::<()>(|_, ctx| {
    ///     Emit::next(format!("{}", ctx.increment()))
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(())
    ///     .attach(());
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
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/snapshots/fmt__hookcontext_increment.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// # stringify!(
    /// println!("{report:?}");
    /// # );
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/snapshots/fmt__hookcontext_increment.snap"))]
    /// </pre>
    ///
    /// [`add_snippet()`]: Self::add_snippet
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
    /// to reference previous frames or the content emitted during [`add_snippet()`].
    ///
    /// This is a utility method, which uses the other primitive method provided to automatically
    /// decrement a counter, if the counter wasn't initialized this method will return `-1` to stay
    /// consistent with [`increment()`].
    ///
    /// ```rust
    /// use std::io::ErrorKind;
    ///
    /// use error_stack::{fmt::Emit, Report};
    ///
    /// Report::install_debug_hook::<()>(|_, ctx| Emit::next(format!("{}", ctx.decrement())));
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(())
    ///     .attach(());
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
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/snapshots/fmt__hookcontext_decrement.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// # stringify!(
    /// println!("{report:?}");
    /// # );
    /// ```
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/snapshots/fmt__hookcontext_decrement.snap"))]
    /// </pre>
    ///
    /// [`increment()`]: Self::increment
    /// [`add_snippet()`]: Self::add_snippet
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

/// The return type of every hook.
///
/// This is like a [`Result`] or [`Option`] type, but with different semantics.
/// The different variants indicate what the state of the hook invocation was.
pub enum Call<'a, T> {
    /// The hook invocation was successful, a value could be found.
    // name TBD
    Find(Emit),
    /// The hook invocation was unsuccessful, because it was unable to be called for type `T`,
    /// returns the ownership of the [`HookContext`], that the function could have used to store
    /// data or emit [`Snippet`]s
    // name TBD
    Miss(HookContext<'a, T>),
}

impl<'a, T> Call<'a, T> {
    /// Cast the inner [`HookContext`], if present to `U`, corresponds to [`HookContext::cast`]
    pub fn cast<U>(self) -> Call<'a, U> {
        match self {
            Call::Find(emit) => Call::Find(emit),
            Call::Miss(ctx) => Call::Miss(ctx.cast()),
        }
    }

    pub(crate) fn consume(self) -> Option<Emit> {
        match self {
            Call::Find(emit) => Some(emit),
            Call::Miss(_) => None,
        }
    }

    /// Execute the closure provided, if the current variant is [`Call::Miss`], with the
    /// [`HookContext`] it currently holds.
    ///
    /// The closure must return [`Call`], but is able to cast [`HookContext`] to any type.
    pub fn or_else<U>(self, closure: impl FnOnce(HookContext<T>) -> Call<U>) -> Call<'a, U> {
        match self {
            Call::Find(emit) => Call::Find(emit),
            Call::Miss(ctx) => closure(ctx.cast()),
        }
    }
}

type BoxedHook =
    Box<dyn for<'a> Fn(&Frame, HookContext<'a, Frame>) -> Call<'a, Frame> + Send + Sync>;

/// Holds a chain of [`Hook`]s
///
/// These are used to augment the [`Debug`] and [`Display`] information
/// of attachments, which are normally not printable.
///
/// [`Hook`]s are added via [`.push()`], which is implemented for functions with the signature:
/// [`Fn(&T, HookContext<T>) -> Line + Send + Sync + 'static`] and
/// [`Fn(&T) -> Line + Send + Sync + 'static`]
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
/// [`.push()`]: Hooks::push
#[cfg(feature = "hooks")]
#[must_use]
pub(crate) struct Hooks {
    inner: Option<BTreeMap<TypeId, BoxedHook>>,
    fallback: Option<BoxedHook>,
}

#[cfg(feature = "hooks")]
impl Hooks {
    /// Create a new instance of `Hooks`
    ///
    /// Preloaded with [`Builtin`] hooks display [`Backtrace`] and [`SpanTrace`] if those features
    /// have been enabled.
    ///
    /// [`Backtrace`]: std::backtrace::Backtrace
    /// [`SpanTrace`]: tracing_error::SpanTrace
    pub(crate) const fn new() -> Self {
        Self {
            inner: None,
            fallback: None,
        }
    }

    pub(crate) fn insert<T: Send + Sync + 'static>(
        &mut self,
        hook: impl Fn(&T, &mut HookContext<T>) -> Emit + Send + Sync + 'static,
    ) {
        let mut inner = self.inner.get_or_insert_with(BTreeMap::new);

        inner.insert(
            TypeId::of::<T>(),
            Box::new(move |frame: &Frame, ctx: HookContext<Frame>| {
                // SAFETY: `.unwrap()` never fails here, because `Hooks` guarantees the function
                // will never be called on an object which cannot be downcast.
                let frame = frame.downcast_ref::<T>().unwrap();

                Call::Find(hook(frame, &mut ctx.cast()))
            }),
        );
    }

    pub(crate) fn fallback(
        &mut self,
        hook: impl for<'a> Fn(&Frame, HookContext<'a, Frame>) -> Call<'a, Frame> + Send + Sync + 'static,
    ) {
        self.fallback = Some(Box::new(hook));
    }

    pub(crate) fn call<'a>(&self, frame: &Frame, ctx: HookContext<'a, Frame>) -> Call<'a, Frame> {
        let ty = Frame::type_id(frame);

        if let Some(hook) = self.inner.as_ref().and_then(|map| map.get(&ty)) {
            (hook)(frame, ctx)
        } else if let Some(fallback) = self.fallback.as_ref() {
            (fallback)(frame, ctx)
        } else {
            builtin(frame, ctx)
        }
    }
}

mod default {
    #[cfg(any(all(nightly, feature = "std"), feature = "spantrace"))]
    use alloc::format;
    #[cfg(all(nightly, feature = "std"))]
    use std::backtrace::Backtrace;

    #[cfg(feature = "spantrace")]
    use tracing_error::SpanTrace;

    use crate::{
        fmt::{hook::HookContext, Call, Emit, Snippet},
        Frame,
    };

    #[cfg(all(nightly, feature = "std"))]
    fn backtrace(backtrace: &Backtrace, ctx: &mut HookContext<Backtrace>) -> Emit {
        let idx = ctx.increment();

        ctx.add_snippet(Snippet::force(format!(
            "Backtrace No. {}\n{}",
            idx + 1,
            backtrace
        )));

        Emit::Defer(format!(
            "backtrace with {} frames ({})",
            backtrace.frames().len(),
            idx + 1
        ))
    }

    #[cfg(feature = "spantrace")]
    fn spantrace(spantrace: &SpanTrace, ctx: &mut HookContext<SpanTrace>) -> Emit {
        let idx = ctx.increment();

        let mut span = 0;
        spantrace.with_spans(|_, _| {
            span += 1;
            true
        });

        ctx.add_snippet(Snippet::force(format!(
            "Span Trace No. {}\n{}",
            idx + 1,
            spantrace
        )));

        Emit::Defer(format!("spantrace with {span} frames ({})", idx + 1))
    }

    /// Builtin hooks
    ///
    /// This provides defaults for common attachments that are automatically created
    /// by `error_stack`, like [`Backtrace`] and [`SpanTrace`]
    ///
    /// [`Backtrace`]: std::backtrace::Backtrace
    /// [`SpanTrace`]: tracing_error::SpanTrace
    // Frame can be unused, if neither backtrace or spantrace are enabled
    #[allow(unused_variables)]
    pub fn builtin<'a>(frame: &Frame, ctx: HookContext<'a, Frame>) -> Call<'a, Frame> {
        #[cfg(all(nightly, feature = "std"))]
        if let Some(bt) = frame.request_ref() {
            return Call::Find(backtrace(bt, &mut ctx.cast()));
        }

        #[cfg(all(feature = "spantrace", not(nightly)))]
        if let Some(st) = frame.downcast_ref() {
            return Call::Find(spantrace(st, &mut ctx.cast()));
        }

        #[cfg(all(feature = "spantrace", nightly))]
        if let Some(st) = frame.request_ref() {
            return Call::Find(spantrace(st, &mut ctx.cast()));
        }

        Call::Miss(ctx)
    }
}

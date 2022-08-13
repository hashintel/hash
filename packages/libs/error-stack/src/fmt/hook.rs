#[cfg(any(
    feature = "hooks",
    feature = "spantrace",
    all(nightly, feature = "std"),
    feature = "experimental"
))]
use alloc::borrow::ToOwned;
#[cfg(any(
    feature = "hooks",
    feature = "spantrace",
    all(nightly, feature = "std")
))]
use alloc::{boxed::Box, collections::BTreeMap};
use alloc::{string::String, vec::Vec};
#[cfg(any(
    feature = "hooks",
    feature = "spantrace",
    all(nightly, feature = "std")
))]
use core::any::{Any, TypeId};
use core::marker::PhantomData;

pub use builtin::Builtin;

use crate::fmt::Emit;
#[cfg(feature = "hooks")]
use crate::fmt::Frame;

#[derive(Default)]
pub struct HookContextImpl {
    pub(crate) text: Vec<Vec<String>>,
    alternate: bool,
    #[cfg(any(
        feature = "hooks",
        feature = "spantrace",
        all(nightly, feature = "std")
    ))]
    inner: BTreeMap<TypeId, BTreeMap<TypeId, Box<dyn Any>>>,
}

impl HookContextImpl {
    #[cfg_attr(
        not(any(
            feature = "hooks",
            feature = "spantrace",
            all(nightly, feature = "std"),
            feature = "experimental"
        )),
        allow(clippy::unused_self)
    )]
    pub(crate) fn cast<T>(&mut self) -> HookContext<T> {
        HookContext {
            #[cfg(any(
                feature = "hooks",
                feature = "spantrace",
                all(nightly, feature = "std"),
                feature = "experimental"
            ))]
            parent: self,
            #[cfg(not(any(
                feature = "hooks",
                feature = "spantrace",
                all(nightly, feature = "std"),
                feature = "experimental"
            )))]
            _parent: PhantomData::default(),
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
/// 1) Emitting `text`
/// 2) Storage
///
/// ## Emitting Text
///
/// A [`Debug`] backtrace consists of two different sections, a rendered tree of objects and
/// additional text/information that is too large to fit.
/// There is no guarantee that the text set via [`set_text()`] will be displayed on every invocation
/// and is currently only output when the alternate format (`:#?`) has been requested.
///
/// [`set_text()`]: HookContext::set_text
///
/// ### Example
///
/// ```rust
/// use std::io::ErrorKind;
///
/// use error_stack::{
///     fmt::{HookContext, Emit, Hook},
///     Report, Frame
/// };
/// use insta::assert_snapshot;
///
/// # struct Bare;
/// # impl Hook<Frame, ()> for Bare {
/// #     fn call(&self, _: &Frame, _: HookContext<Frame>) -> Option<Emit> {
/// #         None
/// #     }
/// # }
/// # Report::install_debug_hook_fallback(Bare);
///
/// Report::install_debug_hook(|val: &u64, ctx: &mut HookContext<u64>| {
///     ctx.set_text("u64 has been encountered");
///     Emit::next(val.to_string())
/// });
///
/// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
///     .attach(2u64)
///     .attach(3u64);
///
/// assert_snapshot!(format!("{report:#?}"), @r###"3
/// │ src/fmt/hook.rs:20:6
/// ├─▶ 2
/// │   ╰ src/fmt/hook.rs:19:6
/// ├─▶ invalid input parameter
/// │   ╰ src/fmt/hook.rs:18:14
/// ╰─▶ 1 additional attachment
///
///
/// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
///
/// u64 has been encountered
///
/// u64 has been encountered"###);
/// ```
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
/// All data stored in `HookContext` is completely separated from all other [`Hook`]s and can store
/// any arbitrary data of any type, and even data of multiple types at the same time.
///
/// ### Example
///
/// ```rust
/// use std::io::ErrorKind;
///
/// use error_stack::{
///     fmt::{HookContext, Emit, Hook},
///     Report, Frame
/// };
/// use insta::assert_snapshot;
///
/// # struct Bare;
/// # impl Hook<Frame, ()> for Bare {
/// #     fn call(&self, _: &Frame, _: HookContext<Frame>) -> Option<Emit> {
/// #         None
/// #     }
/// # }
/// # Report::install_debug_hook_fallback(Bare);
///
/// Report::install_debug_hook(|val: &u64, ctx: &mut HookContext<u64>| {
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
/// assert_snapshot!(format!("{report:#?}"), @r###"3 (acc: 3, div: 0.33333334)
/// │ src/fmt/hook.rs:27:6
/// ├─▶ 2 (acc: 5, div: 0.5)
/// │   ╰ src/fmt/hook.rs:26:6
/// ├─▶ invalid input parameter
/// │   ╰ src/fmt/hook.rs:25:14
/// ╰─▶ 1 additional attachment"###);
/// ```
pub struct HookContext<'a, T> {
    #[cfg(any(
        feature = "hooks",
        feature = "spantrace",
        all(nightly, feature = "std"),
        feature = "experimental"
    ))]
    parent: &'a mut HookContextImpl,
    _marker: PhantomData<T>,
    #[cfg(not(any(
        feature = "hooks",
        feature = "spantrace",
        all(nightly, feature = "std"),
        feature = "experimental"
    )))]
    _parent: PhantomData<&'a ()>,
}

impl<T> HookContext<'_, T> {
    /// If [`Debug`] requests, this text (which can include line breaks) will be appended to the
    /// main message.
    ///
    /// This is useful for dense information like backtraces, or span traces, which are omitted when
    /// rendering without the alternate [`Debug`] output.
    #[cfg(any(
        feature = "hooks",
        feature = "spantrace",
        all(nightly, feature = "std"),
        feature = "experimental"
    ))]
    pub fn set_text(&mut self, value: &str) {
        self.text_lines(value.lines());
    }

    /// Same as [`Self::text`], but only accepts lines (the internal representation used during
    /// rendering)
    #[cfg(any(
        feature = "hooks",
        feature = "spantrace",
        all(nightly, feature = "std"),
        feature = "experimental"
    ))]
    fn text_lines(&mut self, lines: core::str::Lines) {
        self.parent
            .text
            .push(lines.map(ToOwned::to_owned).collect());
    }
}

impl<'a, T> HookContext<'a, T> {
    /// Cast the [`HookContext`] to a new type `U`.
    ///
    /// The storage of [`HookContext`] is partitioned, meaning that if `T` and `U` are different
    /// types the values stored in [`HookContext<T>`] will be separated from values in
    /// [`HookContext<U>`].
    ///
    /// Most user-facing should never need to use this function, as function hooks are only able to
    /// get a mutable reference to [`HookContext`].
    /// This is not the case for for [`Hook::call`], which receives the context as value,
    /// allowing for "dynamic" recasting, if needed, for example to implement [`Hook`] on custom
    /// types.
    ///
    /// ### Example
    ///
    /// ```rust
    /// use std::io::ErrorKind;
    /// use error_stack::{fmt::{Hook, HookContext, Emit}, Frame, Report };
    /// use insta::assert_snapshot;
    ///
    /// # struct Bare;
    /// # impl Hook<Frame, ()> for Bare {
    /// #     fn call(&self, _: &Frame, _: HookContext<Frame>) -> Option<Emit> {
    /// #         None
    /// #     }
    /// # }
    /// # Report::install_debug_hook_fallback(Bare);
    ///
    /// struct CustomHook;
    /// struct Value(u64);
    ///
    /// impl Hook<Value, ()> for CustomHook {
    ///     fn call(&self, _: &Value, ctx: HookContext<Value>) -> Option<Emit> {
    ///         // the inner value of `Value` is always `u64`,
    ///         // we therefore only "mask" u64 and want to use the same incremental value.
    ///         let mut ctx = ctx.cast::<u64>();
    ///         Some(Emit::next(format!("{} (Value)", ctx.increment())))
    ///     }
    /// }
    ///
    /// Report::install_debug_hook(|_: &u64, ctx: &mut HookContext<u64>| Emit::next(format!("{}", ctx.increment())));
    /// Report::install_debug_hook(CustomHook);
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(1u64)
    ///     .attach(Value(2u64))
    ///     .attach(3u64);
    ///
    /// assert_snapshot!(format!("{report:?}"), @r###"0
    /// │ src/fmt/hook.rs:34:6
    /// ├─▶ 1 (Value)
    /// │   ╰ src/fmt/hook.rs:33:6
    /// ├─▶ 2
    /// │   ╰ src/fmt/hook.rs:32:6
    /// ├─▶ invalid input parameter
    /// │   ╰ src/fmt/hook.rs:31:14
    /// ╰─▶ 1 additional attachment"###);
    /// ```
    #[must_use]
    #[cfg(any(
        feature = "hooks",
        feature = "spantrace",
        all(nightly, feature = "std"),
    ))]
    pub fn cast<U>(self) -> HookContext<'a, U> {
        HookContext {
            parent: self.parent,
            _marker: PhantomData::default(),
        }
    }

    // TODO: text force (how?)
    /// Is the currently requested format the alternate representation?
    /// This corresponds to the output of [`std::fmt::Formatter::alternate`].
    #[cfg(feature = "hooks")]
    #[must_use]
    pub fn alternate(&self) -> bool {
        self.parent.alternate
    }

    #[cfg(feature = "hooks")]
    fn into_impl(self) -> &'a mut HookContextImpl {
        self.parent
    }
}

impl<T: 'static> HookContext<'_, T> {
    /// Return a reference to a value of type `U`, if a value of that type exists.
    ///
    /// Values returned are isolated and therefore "bound" to `T`, this means that if two different
    /// [`HookContext`]s that share the same inner value (e.g. same invocation of [`Debug`]) will
    /// return the same value.
    #[cfg(feature = "hooks")]
    #[must_use]
    pub fn get<U: 'static>(&self) -> Option<&U> {
        self.parent
            .inner
            .get(&TypeId::of::<T>())?
            .get(&TypeId::of::<U>())?
            .downcast_ref()
    }

    /// Return a mutable reference to a value of type `U`, if a value of that type exists.
    ///
    /// Values returned are isolated and therefore "bound" to `T`, this means that if two different
    /// [`HookContext`]s that share the same inner value (e.g. same invocation of [`Debug`]) will
    /// return the same value.
    #[cfg(any(
        feature = "hooks",
        feature = "spantrace",
        all(nightly, feature = "std")
    ))]
    pub fn get_mut<U: 'static>(&mut self) -> Option<&mut U> {
        self.parent
            .inner
            .get_mut(&TypeId::of::<T>())?
            .get_mut(&TypeId::of::<U>())?
            .downcast_mut()
    }

    /// Insert a new value of type `U` into the storage of [`HookContext`].
    ///
    /// The returned value will the previously stored value of the same type `U` scoped over type
    /// `T`, if it existed, did no such value exist it will return [`None`].
    #[cfg(any(
        feature = "hooks",
        feature = "spantrace",
        all(nightly, feature = "std")
    ))]
    pub fn insert<U: 'static>(&mut self, value: U) -> Option<U> {
        self.parent
            .inner
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
    #[cfg(feature = "hooks")]
    pub fn remove<U: 'static>(&mut self) -> Option<U> {
        self.parent
            .inner
            .get_mut(&TypeId::of::<T>())?
            .remove(&TypeId::of::<U>())?
            .downcast()
            .map(|boxed| *boxed)
            .ok()
    }

    /// One of the most common interactions with [`HookContext`] is a counter to reference previous
    /// frames or the content emitted during [`set_text()`].
    ///
    /// This is a utility method, which uses the other primitive methods provided to automatically
    /// increment a counter, if the counter wasn't initialized this method will return `0`.
    ///
    /// ```rust
    /// use std::io::ErrorKind;
    ///
    /// use insta::assert_snapshot;
    /// use error_stack::{Frame, Report};
    /// use error_stack::fmt::{Emit, Hook, HookContext};
    ///
    /// # struct Bare;
    /// # impl Hook<Frame, ()> for Bare {
    /// #     fn call(&self, _: &Frame, _: HookContext<Frame>) -> Option<Emit> {
    /// #         None
    /// #     }
    /// # }
    /// # Report::install_debug_hook_fallback(Bare);
    ///
    /// Report::install_debug_hook(|_: &(), ctx: &mut HookContext<()>|{
    ///     Emit::next(format!("{}", ctx.increment()))
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(())
    ///     .attach(());
    ///
    /// assert_snapshot!(format!("{report:?}"), @r###"0
    /// │ src/fmt/hook.rs:19:6
    /// ├─▶ 1
    /// │   ╰ src/fmt/hook.rs:18:6
    /// ├─▶ invalid input parameter
    /// │   ╰ src/fmt/hook.rs:17:14
    /// ╰─▶ 1 additional attachment"###);
    /// ```
    ///
    /// [`set_text()`]: Self::set_text
    #[cfg(any(
        feature = "hooks",
        feature = "spantrace",
        all(nightly, feature = "std")
    ))]
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
    /// to reference previous frames or the content emitted during [`set_text()`].
    ///
    /// This is a utility method, which uses the other primitive method provided to automatically
    /// decrement a counter, if the counter wasn't initialized this method will return `-1` to stay
    /// consistent with [`increment()`].
    ///
    /// ```rust
    /// use std::io::ErrorKind;
    ///
    /// use error_stack::{
    ///     fmt::{HookContext, Emit, Hook},
    ///     Report, Frame,
    /// };
    /// use insta::assert_snapshot;
    ///
    /// # struct Bare;
    /// # impl Hook<Frame, ()> for Bare {
    /// #     fn call(&self, _: &Frame, _: HookContext<Frame>) -> Option<Emit> {
    /// #         None
    /// #     }
    /// # }
    /// # Report::install_debug_hook_fallback(Bare);
    ///
    ///
    /// Report::install_debug_hook(|_: &(), ctx: &mut HookContext<()>| {
    ///     Emit::next(format!("{}", ctx.decrement()))
    /// });
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(())
    ///     .attach(());
    ///
    /// assert_snapshot!(format!("{report:?}"), @r###"-1
    /// │ src/fmt/hook.rs:19:6
    /// ├─▶ -2
    /// │   ╰ src/fmt/hook.rs:18:6
    /// ├─▶ invalid input parameter
    /// │   ╰ src/fmt/hook.rs:17:14
    /// ╰─▶ 1 additional attachment"###);
    /// ```
    ///
    /// [`increment()`]: Self::increment
    /// [`set_text()`]: Self::set_text
    #[cfg(feature = "hooks")]
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

/// Trait to interact and inject information on [`Debug`]
///
/// A [`Hook`] can be used to emit a [`Line`] for a [`Frame`], if it can be downcast to `T`.
///
/// `U` are the arguments a [`Fn`] takes, user defined implementations should set this to `()`.
///
/// This trait is automatically implemented for [`Fn(&T) -> Line`] and
/// [`Fn(&T, &mut HookContext<T>) -> Line`].
pub trait Hook<T, U>: Send + Sync + 'static {
    /// Function which is called to invoke the hook on a potentially downcasted [`Frame`].
    ///
    /// This function must return [`Option<Line>`], if this function return [`None`] it is
    /// determined that the hook did **not** successfully execute or wasn't applicable,
    /// and other [`Hook`]s are tried, until all [`Hook`]s have been tried, or a single [`Hook`]
    /// returned [`Some`].
    ///
    /// This function is not guaranteed to run for every [`Frame`] that can be downcast to `T`,
    /// and will only be called if no [`Hook`] before, that has been deemed suitable has returned
    /// [`None`].
    ///
    /// ## Explanation
    ///
    /// This pseudo code roughly explains how calling of [`Hook`]s is performed.
    ///
    /// ```text
    /// have a list of hooks H
    /// have a frame F
    ///
    /// for every hook h in H {
    ///     able = can F be downcast to T (of h)?
    ///     if not able {
    ///         skip
    ///     }
    ///     
    ///     f = F.downcast();
    ///
    ///     if let Some(result) = h.call(f) {
    ///         return Some(result)
    ///     }
    /// }
    ///
    /// return None
    /// ```
    fn call(&self, frame: &T, ctx: HookContext<T>) -> Option<Emit>;
}

#[cfg(feature = "hooks")]
impl<F, T> Hook<T, ()> for F
where
    F: Fn(&T, &mut HookContext<T>) -> Emit + Send + Sync + 'static,
    T: Send + Sync + 'static,
{
    fn call(&self, frame: &T, mut ctx: HookContext<T>) -> Option<Emit> {
        Some((self)(frame, &mut ctx))
    }
}

#[cfg(feature = "hooks")]
impl<F, T> Hook<T, (T,)> for F
where
    F: Fn(&T) -> Emit + Send + Sync + 'static,
    T: Send + Sync + 'static,
{
    fn call(&self, frame: &T, _: HookContext<T>) -> Option<Emit> {
        Some((self)(frame))
    }
}

#[cfg(feature = "hooks")]
type ErasedHook = Box<dyn Hook<Frame, ()> + Send + Sync>;

#[cfg(feature = "hooks")]
impl Hook<Frame, ()> for ErasedHook {
    fn call(&self, frame: &Frame, ctx: HookContext<Frame>) -> Option<Emit> {
        let hook = self.as_ref();

        hook.call(frame, ctx)
    }
}

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
    inner: BTreeMap<TypeId, ErasedHook>,
    fallback: ErasedHook,
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
    pub(crate) fn new() -> Self {
        Self {
            inner: BTreeMap::new(),
            fallback: Box::new(Builtin),
        }
    }

    pub(crate) fn insert<H: Hook<T, U>, T: Send + Sync + 'static, U: 'static>(&mut self, hook: H) {
        struct Dispatch<T, U> {
            inner: Box<dyn Hook<T, U>>,
        }

        impl<T: Send + Sync + 'static, U: 'static> Hook<Frame, ()> for Dispatch<T, U> {
            fn call(&self, frame: &Frame, ctx: HookContext<Frame>) -> Option<Emit> {
                // SAFETY: `.unwrap()` never fails here, because `Hooks` guarantees the function
                // will never be called on an object which cannot be downcast.
                let frame = frame.downcast_ref::<T>().unwrap();

                self.inner.call(frame, ctx.cast())
            }
        }

        let dispatch = Dispatch {
            inner: Box::new(hook),
        };

        self.inner.insert(TypeId::of::<T>(), Box::new(dispatch));
    }

    pub(crate) fn fallback<H: Hook<Frame, ()>>(&mut self, hook: H) {
        self.fallback = Box::new(hook);
    }
}

#[cfg(feature = "hooks")]
impl Hook<Frame, ()> for Hooks {
    fn call(&self, frame: &Frame, ctx: HookContext<Frame>) -> Option<Emit> {
        let ty = Frame::type_id(frame);

        if let Some(hook) = self.inner.get(&ty) {
            hook.call(frame, ctx)
        } else {
            self.fallback.call(frame, ctx)
        }
    }
}

mod builtin {
    #[cfg(any(all(nightly, feature = "std"), feature = "spantrace"))]
    use alloc::format;
    #[cfg(all(nightly, feature = "std"))]
    use std::backtrace::Backtrace;

    #[cfg(feature = "spantrace")]
    use tracing_error::SpanTrace;

    use crate::{
        fmt::{
            hook::{Hook, HookContext},
            Emit,
        },
        Frame,
    };

    #[cfg(all(nightly, feature = "std"))]
    fn backtrace(backtrace: &Backtrace, ctx: &mut HookContext<Backtrace>) -> Emit {
        let idx = ctx.increment();

        ctx.set_text(&format!("Backtrace No. {}\n{}", idx + 1, backtrace));

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

        ctx.set_text(&format!("Span Trace No. {}\n{}", idx + 1, spantrace));

        Emit::Defer(format!("spantrace with {span} frames ({})", idx + 1))
    }

    /// Builtin hooks
    ///
    /// This provides defaults for common attachments that are automatically created
    /// by `error_stack`, like [`Backtrace`] and [`SpanTrace`]
    ///
    /// [`Backtrace`]: std::backtrace::Backtrace
    /// [`SpanTrace`]: tracing_error::SpanTrace
    pub struct Builtin;

    impl Hook<Frame, ()> for Builtin {
        #[allow(unused_variables)]
        fn call(&self, frame: &Frame, ctx: HookContext<Frame>) -> Option<Emit> {
            #[cfg(all(nightly, feature = "std"))]
            if let Some(bt) = frame.request_ref() {
                return Some(backtrace(bt, &mut ctx.cast()));
            }

            #[cfg(all(feature = "spantrace", not(nightly)))]
            if let Some(st) = frame.downcast_ref() {
                return Some(spantrace(st, &mut ctx.cast()));
            }

            #[cfg(all(feature = "spantrace", nightly))]
            if let Some(st) = frame.request_ref() {
                return Some(spantrace(st, &mut ctx.cast()));
            }

            None
        }
    }
}

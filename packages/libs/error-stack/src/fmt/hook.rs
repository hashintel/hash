use alloc::{borrow::ToOwned, boxed::Box, collections::BTreeMap, string::String, vec::Vec};
use core::{
    any::{Any, TypeId},
    marker::PhantomData,
};

pub use builtin::Builtin;

use crate::fmt::Line;
#[cfg(feature = "hooks")]
use crate::Frame;

#[derive(Default)]
pub struct HookContextImpl {
    pub(crate) text: Vec<Vec<String>>,
    inner: BTreeMap<TypeId, BTreeMap<TypeId, Box<dyn Any>>>,
}

impl HookContextImpl {
    pub(crate) fn cast<T>(&mut self) -> HookContext<T> {
        HookContext {
            parent: self,
            _marker: PhantomData::default(),
        }
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
/// ### Example
///
/// ```rust
/// use std::io::ErrorKind;
///
/// use error_stack::{
///     fmt::{HookContext, Hooks, Line},
///     Report,
/// };
/// use insta::assert_snapshot;
///
/// Report::install_hook(Hooks::bare().push(|val: &u64, ctx: &mut HookContext<u64>| {
///     ctx.set_text("u64 has been encountered");
///     Line::next(val.to_string())
/// }))
/// .unwrap();
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
/// any arbitrary value for the duration of the hook invocation.
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
///     fmt::{HookContext, Hooks, Line},
///     Report,
/// };
/// use insta::assert_snapshot;
///
/// Report::install_hook(Hooks::bare().push(|val: &u64, ctx: &mut HookContext<u64>| {
///     let mut acc = ctx.get::<u64>().copied().unwrap_or(0);
///     acc += *val;
///
///     let mut div = ctx.get::<f32>().copied().unwrap_or(1.0);
///     div /= *val as f32;
///
///     ctx.insert(acc);
///
///     Line::next(format!("{val} (acc: {acc}, div: {div})"))
/// }))
/// .unwrap();
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
    parent: &'a mut HookContextImpl,
    _marker: PhantomData<T>,
}

impl<T> HookContext<'_, T> {
    /// If [`Debug`] requests, this text (which can include line breaks) will be appended to the
    /// main message.
    ///
    /// This is useful for dense information like backtraces, or span traces, which are omitted when
    /// rendering without the alternate [`Debug`] output.
    pub fn set_text(&mut self, value: &str) {
        self.text_lines(value.lines());
    }

    /// Same as [`Self::text`], but only accepts lines (the internal representation used during
    /// rendering)
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
    ///
    /// use error_stack::{
    ///     fmt::{Hook, HookContext, Hooks, Line},
    ///     Report,
    /// };
    /// use insta::assert_snapshot;
    ///
    /// struct CustomHook;
    /// struct Value(u64);
    ///
    /// impl Hook<Value, ()> for CustomHook {
    ///     fn call(&self, _: &Value, ctx: HookContext<Value>) -> Option<Line> {
    ///         // the inner value of `Value` is always `u64`,
    ///         // we therefore only "mask" u64 and want to use the same incremental value.
    ///         let mut ctx = ctx.cast::<u64>();
    ///         Some(Line::next(format!("{} (Value)", ctx.increment())))
    ///     }
    /// }
    ///
    /// Report::install_hook(
    ///     Hooks::bare()
    ///         .push(|_: &u64, ctx: &mut HookContext<u64>| Line::next(format!("{}", ctx.increment())))
    ///         .push(CustomHook),
    /// )
    /// .unwrap();
    ///
    /// let report = Report::new(std::io::Error::from(ErrorKind::InvalidInput))
    ///     .attach(1u64)
    ///     .attach(Value(2u64))
    ///     .attach(3u64);
    ///
    /// assert_snapshot!(format!("{report:?}"), @r###"0
    /// │ src/fmt/hook.rs:28:6
    /// ├─▶ 1 (Value)
    /// │   ╰ src/fmt/hook.rs:27:19
    /// ├─▶ 2
    /// │   ╰ src/fmt/hook.rs:27:6
    /// ├─▶ invalid input parameter
    /// │   ╰ src/fmt/hook.rs:26:14
    /// ╰─▶ 1 additional attachment"###);
    /// ```
    #[must_use]
    pub fn cast<U>(self) -> HookContext<'a, U> {
        HookContext {
            parent: self.parent,
            _marker: PhantomData::default(),
        }
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
    pub fn insert<U: 'static>(&mut self, value: U) -> Option<Box<U>> {
        self.parent
            .inner
            .entry(TypeId::of::<T>())
            .or_default()
            .insert(TypeId::of::<U>(), Box::new(value))?
            .downcast()
            .ok()
    }

    /// Remove the value of type `U` from the storage of [`HookContext`] if it existed.
    ///
    /// The returned value will be the previously stored value of the same type `U`.
    pub fn remove<U: 'static>(&mut self) -> Option<Box<U>> {
        self.parent
            .inner
            .get_mut(&TypeId::of::<T>())?
            .remove(&TypeId::of::<U>())?
            .downcast()
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
    /// use error_stack::{
    ///     fmt::{HookContext, Hooks, Line},
    ///     Report,
    /// };
    /// use insta::assert_snapshot;
    ///
    /// Report::install_hook(Hooks::bare().push(|_: &(), ctx: &mut HookContext<()>| {
    ///     Line::next(format!("{}", ctx.increment()))
    /// }))
    /// .unwrap();
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
    ///     fmt::{HookContext, Hooks, Line},
    ///     Report,
    /// };
    /// use insta::assert_snapshot;
    ///
    /// Report::install_hook(Hooks::bare().push(|_: &(), ctx: &mut HookContext<()>| {
    ///     Line::next(format!("{}", ctx.decrement()))
    /// }))
    /// .unwrap();
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

type UInt0 = ();
#[cfg(feature = "hooks")]
type UInt1 = ((), UInt0);
#[cfg(feature = "hooks")]
type UInt2 = ((), UInt1);

/// Trait to interact and inject information on [`Debug`]
///
/// A Hook which potentially outputs a line, if conditions met in [`call()`] are met for a specific
/// type `T`, and a specific number of arguments `U`.
///
/// This trait is used internally and is automatically implemented for [`Fn(&T) -> Line`]
/// and [`Fn(&T, &mut HookContext<T>) -> Line`]
///
/// [`call()`]: Self::call
pub trait Hook<T, U> {
    /// This function gets called for every frame, but only if no other hook before has returned a
    /// [`Line`].
    ///
    /// The implementation can either find an acceptable hook to process the frame
    /// (will return [`Some`]) or cannot process the [`Frame`] and return [`None`],
    /// elementary types *should* always return [`Some`] and not do any casting, while combinators
    /// can use [`None`] to propagate to other elementary hooks.
    fn call(&self, frame: &T, ctx: HookContext<T>) -> Option<Line>;
}

#[cfg(feature = "hooks")]
impl<F, T> Hook<T, UInt2> for F
where
    F: Fn(&T, &mut HookContext<T>) -> Line,
    T: Send + Sync + 'static,
{
    fn call(&self, frame: &T, mut ctx: HookContext<T>) -> Option<Line> {
        Some((self)(frame, &mut ctx))
    }
}

#[cfg(feature = "hooks")]
impl<F, T> Hook<T, UInt1> for F
where
    F: Fn(&T) -> Line,
    T: Send + Sync + 'static,
{
    fn call(&self, frame: &T, _: HookContext<T>) -> Option<Line> {
        Some((self)(frame))
    }
}

/// A Stack is a simple struct which has a left and a right side,
/// this is used to chain different hooks together into a list of typed hooks.
///
/// Consider the following list of hooks: `[HookA, HookB, HookC]` this would be modelled as:
///
/// ```text
/// Stack<HookA,
///     Stack<HookB,
///         Stack<HookC, ()>
///     >
/// >
/// ```
///
/// The [`Hook`] implementation of stack will check if the left side supports a [`downcast_ref`] for
/// the specified frame, if that's the case it will execute the left [`call()`], otherwise it will
/// call the right [`call()`], two combine multiple stacks use [`Combine`].
///
/// [`call()`]: Hook::call
/// [`downcast_ref`]: Frame::downcast_ref
#[cfg(feature = "hooks")]
pub struct Stack<L, T, R> {
    left: L,
    right: R,
    _marker: PhantomData<T>,
}

#[cfg(feature = "hooks")]
impl<L, T, R> Stack<L, T, R> {
    /// Create a new stack
    pub fn new(left: L, right: R) -> Self {
        Self {
            left,
            right,
            _marker: PhantomData::default(),
        }
    }
}

// clippy::mismatching_type_param_order is a false positive
#[cfg(feature = "hooks")]
#[allow(clippy::mismatching_type_param_order)]
impl<L, T, U, R> Hook<Frame, UInt0> for Stack<L, (T, U), R>
where
    L: Hook<T, U>,
    T: Send + Sync + 'static,
    R: Hook<Frame, ()>,
{
    fn call(&self, frame: &Frame, ctx: HookContext<Frame>) -> Option<Line> {
        if let Some(frame) = frame.downcast_ref::<T>() {
            self.left.call(frame, ctx.cast())
        } else {
            self.right.call(frame, ctx)
        }
    }
}

/// Combine multiple hooks without eagerly casting.
///
/// This is the same as [`Stack`], with the difference that it will combine both sides and try both
/// if the left side was unsuccessful.
/// This will short circuit.
///
/// Consider the following example: `[HookA, HookB, HookC]`
///
/// ```text
/// Combine<
///     Stack<HookA, ()>,
///     Stack<
///         HookB,
///         Stack<HookC, ()>
///     >
/// >
/// ```
///
/// is equivalent to:
///
/// ```text
/// Stack<
///     HookA,
///     Stack<
///         HookB,
///         Stack<HookC, ()>
///     >
/// >
/// ```
#[cfg(feature = "hooks")]
pub struct Combine<L, R> {
    left: L,
    right: R,
}

#[cfg(feature = "hooks")]
impl<L, R> Combine<L, R> {
    /// Create a new combine
    pub const fn new(left: L, right: R) -> Self {
        Self { left, right }
    }
}

#[cfg(feature = "hooks")]
impl<L, R> Hook<Frame, UInt0> for Combine<L, R>
where
    L: Hook<Frame, UInt0>,
    R: Hook<Frame, UInt0>,
{
    fn call(&self, frame: &Frame, ctx: HookContext<Frame>) -> Option<Line> {
        let parent = ctx.into_impl();

        self.left
            .call(frame, parent.cast())
            .or_else(|| self.right.call(frame, parent.cast()))
    }
}

#[cfg(feature = "hooks")]
impl Hook<Frame, UInt0> for Box<dyn Hook<Frame, UInt0> + Send + Sync> {
    fn call(&self, frame: &Frame, ctx: HookContext<Frame>) -> Option<Line> {
        let hook = self.as_ref();

        hook.call(frame, ctx)
    }
}

#[cfg(feature = "hooks")]
impl<T> Hook<T, UInt0> for () {
    fn call(&self, _: &T, _: HookContext<T>) -> Option<Line> {
        None
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
pub struct Hooks<T: Hook<Frame, UInt0>>(T);

#[cfg(feature = "hooks")]
impl Hooks<Builtin> {
    /// Create a new instance of `Hooks`
    ///
    /// Preloaded with [`Builtin`] hooks display [`Backtrace`] and [`SpanTrace`] if those features
    /// have been enabled.
    ///
    /// [`Backtrace`]: std::backtrace::Backtrace
    /// [`SpanTrace`]: tracing_error::SpanTrace
    pub const fn new() -> Self {
        Self(Builtin)
    }
}

#[cfg(feature = "hooks")]
impl Default for Hooks<Builtin> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(feature = "hooks")]
impl Hooks<()> {
    /// Create a new bare instance of `Hooks`.
    ///
    /// A bare `Hooks` instance does not have [`Builtin`] hooks pre-installed, use [`new()`] to get
    /// an instance with [`Builtin`] hook support.
    ///
    /// [`new()`]: Self::new
    pub const fn bare() -> Self {
        Self(())
    }
}

#[cfg(feature = "hooks")]
impl<T: Hook<Frame, UInt0>> Hooks<T> {
    const fn new_with(hook: T) -> Self {
        Self(hook)
    }

    /// Push a new [`Hook`] onto the stack.
    ///
    /// [`Hook`] is implemented for [`Fn(&T) -> Line + Send + Sync + 'static`]
    /// and [`Fn(&T, &mut HookContext<T>) -> Line + Send + Sync + 'static`].
    ///
    /// # Implementation Notes
    ///
    /// This functions consumes `self`, because we change the inner type from `T` to `Stack<H, T>`.
    ///
    /// # Example
    ///
    /// ```
    /// use std::io::{Error, ErrorKind};
    ///
    /// use error_stack::{
    ///     fmt::{HookContext, Hooks, Line},
    ///     report, Report,
    /// };
    ///
    /// let hooks = Hooks::new() //
    ///     .push(|val: &u32| Line::next(format!("{val}u32")))
    ///     .push(|_: &u64, ctx: &mut HookContext<u64>| {
    ///         Line::defer(format!("u64 No. {}", ctx.increment()))
    ///     });
    ///
    /// Report::install_hook(hooks).unwrap();
    ///
    /// let report = report!(Error::from(ErrorKind::InvalidInput))
    ///     .attach(1u32)
    ///     .attach(2u64)
    ///     .attach(3u64)
    ///     .attach(4u32);
    ///
    /// assert!(format!("{report:?}").starts_with("4u32"));
    /// ```
    pub fn push<H: Hook<F, U>, F: Send + Sync + 'static, U>(
        self,
        hook: H,
    ) -> Hooks<Stack<H, (F, U), T>> {
        let stack = Stack::new(hook, self.0);

        Hooks::new_with(stack)
    }

    /// Combine multiple [`Hooks`] together
    ///
    /// The argument will be processed **after** the current stack.
    /// This means that the current stack of [`Hook`]s has a higher priority than the hooks of the
    /// argument.
    ///
    /// # Example
    ///
    /// ```
    /// use std::io::{Error, ErrorKind};
    ///
    /// use error_stack::{
    ///     fmt::{HookContext, Hooks, Line},
    ///     report, Report,
    /// };
    ///
    /// let other = Hooks::new()
    ///     .push(|val: &u32| Line::next(format!("unsigned integer: {val}")))
    ///     .push(|_: &&str| Line::next("You should have used `.attach_printable` ..."));
    ///
    /// let hooks = Hooks::new() //
    ///     .push(|val: &u32| Line::next(format!("{val}u32")))
    ///     .push(|_: &u64, ctx: &mut HookContext<u64>| {
    ///         Line::defer(format!("u64 No. {}", ctx.increment()))
    ///     })
    ///     .combine(other);
    ///
    /// Report::install_hook(hooks).unwrap();
    ///
    /// let report = report!(Error::from(ErrorKind::InvalidInput))
    ///     .attach(1u32)
    ///     .attach(2u64)
    ///     .attach(3u64)
    ///     .attach(4u32)
    ///     .attach("5");
    ///
    /// assert!(format!("{report:?}").starts_with("You should have used `.attach_printable` ..."));
    /// ```
    // clippy::missing_const_for_fn is a false positive
    #[allow(clippy::missing_const_for_fn)]
    pub fn combine<U: Hook<Frame, UInt0>>(self, other: Hooks<U>) -> Hooks<Combine<T, U>> {
        let both = Combine::new(self.0, other.0);

        Hooks::new_with(both)
    }
}

#[cfg(feature = "hooks")]
impl<T: Hook<Frame, UInt0> + Send + Sync + 'static> Hooks<T> {
    pub(crate) fn erase(self) -> ErasedHooks {
        Hooks::new_with(Box::new(self.0))
    }
}

#[cfg(feature = "hooks")]
pub type ErasedHooks = Hooks<Box<dyn Hook<Frame, UInt0> + Send + Sync>>;

#[cfg(feature = "hooks")]
impl ErasedHooks {
    pub(crate) fn call(&self, frame: &Frame, ctx: &mut HookContextImpl) -> Option<Line> {
        self.0.call(frame, ctx.cast())
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
            hook::{Hook, HookContext, UInt0},
            Line,
        },
        Frame,
    };

    #[cfg(all(nightly, feature = "std"))]
    fn backtrace(backtrace: &Backtrace, ctx: &mut HookContext<Backtrace>) -> Line {
        let idx = ctx.increment();

        ctx.set_text(&format!("Backtrace No. {}\n{}", idx + 1, backtrace));

        Line::Defer(format!(
            "backtrace with {} frames ({})",
            backtrace.frames().len(),
            idx + 1
        ))
    }

    #[cfg(feature = "spantrace")]
    fn spantrace(spantrace: &SpanTrace, ctx: &mut HookContext<SpanTrace>) -> Line {
        let idx = ctx.increment();

        let mut span = 0;
        spantrace.with_spans(|_, _| {
            span += 1;
            true
        });

        ctx.set_text(&format!("Span Trace No. {}\n{}", idx + 1, spantrace));

        Line::Defer(format!("spantrace with {span} frames ({})", idx + 1))
    }

    /// Builtin hooks
    ///
    /// This provides defaults for common attachments that are automatically created
    /// by `error_stack`, like [`Backtrace`] and [`SpanTrace`]
    ///
    /// [`Backtrace`]: std::backtrace::Backtrace
    /// [`SpanTrace`]: tracing_error::SpanTrace
    pub struct Builtin;

    impl Hook<Frame, UInt0> for Builtin {
        #[allow(unused_variables)]
        fn call(&self, frame: &Frame, ctx: HookContext<Frame>) -> Option<Line> {
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

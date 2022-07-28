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
    inner: BTreeMap<TypeId, Box<dyn Any>>,
}

impl HookContextImpl {
    pub(crate) fn cast<T>(&mut self) -> HookContext<T> {
        HookContext {
            parent: self,
            _marker: PhantomData::default(),
        }
    }
}

/// Every hook can request their corresponding `HookContext`, which can be used to emit
/// `text` (which will be appended if extended [`Debug`] format (`:#?`) has been requested)
/// or can be used for data which is shared among invocations of the same hook over the whole
/// rendering, meaning that two frames of the same type can share common data during rendering. This
/// is especially helpful for counters.
pub struct HookContext<'a, T> {
    parent: &'a mut HookContextImpl,
    _marker: PhantomData<T>,
}

impl<T> HookContext<'_, T> {
    /// If [`Debug`] requests, this text (can include line breaks) will be appended to the main
    /// message.
    /// This is especially useful for dense information like backtraces,
    /// which one might want to omit from the tree rendering or omit from the normal debug.  
    pub fn text(&mut self, value: &str) {
        self.text_lines(value.lines());
    }

    /// Same as [`Self::text`], but only accepts lines (the internal representation used during
    /// rendering)
    pub fn text_lines(&mut self, lines: core::str::Lines) {
        self.parent
            .text
            .push(lines.map(ToOwned::to_owned).collect());
    }
}

impl<'a, T> HookContext<'a, T> {
    /// Cast the `HookContext` to a new type.
    ///
    /// This binds the parent context to a different value,
    /// which allows to access the data stored for the type this is casted to.
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
    /// Returns a reference to the value corresponding to the currently bound type `T`.
    ///
    /// This will downcast the stored value to `U`, if not possible, it will return [`None`]
    #[must_use]
    pub fn get<U: 'static>(&self) -> Option<&U> {
        let inner = self.parent.inner.get(&TypeId::of::<T>())?;

        inner.downcast_ref()
    }

    /// Returns a mutable reference to the value corresponding to the currently bound type `T`.
    ///
    /// This will downcast the stored value to `U`, if not possible, it will return [`None`]
    pub fn get_mut<U: 'static>(&mut self) -> Option<&mut U> {
        let inner = self.parent.inner.get_mut(&TypeId::of::<T>())?;

        inner.downcast_mut()
    }

    /// Insert a value into the context of the currently bound type `T`.
    ///
    /// Returns the previously stored value, downcast to `U`, if no previous value was stored, or
    /// the downcast was not possible will return [`None`]
    pub fn insert<U: 'static>(&mut self, value: U) -> Option<Box<U>> {
        let inner = self
            .parent
            .inner
            .insert(TypeId::of::<T>(), Box::new(value))?;

        inner.downcast().ok()
    }

    /// One of the most common interactions with [`HookContext`] is a counter to reference previous
    /// frames or the content emitted during [`text()`].
    ///
    /// This is a utility method, which uses the other primitive methods provided to automatically
    /// increment a counter, if the counter wasn't initialized this method will return `0`.
    ///
    /// [`text()`]: Self::text
    pub fn incr(&mut self) -> isize {
        let counter: Option<&mut isize> = self
            .parent
            .inner
            .get_mut(&TypeId::of::<T>())
            .and_then(|any| any.downcast_mut());

        match counter {
            None => {
                // if the counter hasn't been set yet, default to `0`
                self.parent
                    .inner
                    .insert(TypeId::of::<T>(), Box::new(0isize));
                0
            }
            Some(ctr) => {
                *ctr += 1;

                *ctr
            }
        }
    }

    /// One of the most common interactions with [`HookContext`] is a counter
    /// to reference previous frames or the content emitted during [`text()`].
    ///
    /// This is a utility method, which uses the other primitive method provided to automatically
    /// decrement a counter, if the counter wasn't initialized this method will return `-1` to stay
    /// consistent with [`incr()`].
    ///
    /// [`incr()`]: Self::incr
    /// [`text()`]: Self::text
    pub fn decr(&mut self) -> isize {
        let counter: Option<&mut isize> = self
            .parent
            .inner
            .get_mut(&TypeId::of::<T>())
            .and_then(|any| any.downcast_mut());

        match counter {
            None => {
                // given that increment starts with `0` (which is therefore the implicit default
                // value) decrementing the default value results in `-1`,
                // which is why we output that value.
                self.parent
                    .inner
                    .insert(TypeId::of::<T>(), Box::new(-1isize));
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

/// Holds a chain of [`Hook`]s, which are used to augment the [`Debug`] and [`Display`] information
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
    /// Create a new instance of `Hooks`, which is preloaded with [`Builtin`] hooks
    /// to display [`Backtrace`] and [`SpanTrace`] if those features have been enabled.
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
    /// Create a new bare instance of `Hooks`, which does not have the [`Builtin`] hooks
    /// pre-installed, use [`new()`] to get an instance with [`Builtin`] hook support.
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
    ///     .push(|_: &u64, ctx: &mut HookContext<u64>| Line::defer(format!("u64 No. {}", ctx.incr())));
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

    /// Combine multiple [`Hooks`] together, where the argument will be processed **after** the
    /// current stack.
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
    ///     .push(|_: &u64, ctx: &mut HookContext<u64>| Line::defer(format!("u64 No. {}", ctx.incr())))
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
        let idx = ctx.incr();

        ctx.text(&format!("Backtrace No. {}\n{}", idx + 1, backtrace));

        Line::Defer(format!(
            "backtrace with {} frames ({})",
            backtrace.frames().len(),
            idx + 1
        ))
    }

    #[cfg(feature = "spantrace")]
    fn spantrace(spantrace: &SpanTrace, ctx: &mut HookContext<SpanTrace>) -> Line {
        let idx = ctx.incr();

        let mut span = 0;
        spantrace.with_spans(|_, _| {
            span += 1;
            true
        });

        ctx.text(&format!("Span Trace No. {}\n{}", idx + 1, spantrace));

        Line::Defer(format!("spantrace with {span} frames ({})", idx + 1))
    }

    /// Builtin hooks, which provide defaults for common attachments that are automatically created
    /// by `error_stack`, this includes [`Backtrace`] and [`SpanTrace`]
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

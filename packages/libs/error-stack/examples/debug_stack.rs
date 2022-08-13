// TODO: introductory docs

use std::marker::PhantomData;

use error_stack::{
    fmt::{Call, Emit, Hook, HookContext},
    Frame,
};

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
impl<L, T, U, R> Hook<Frame, ()> for Stack<L, (T, U), R>
where
    L: Hook<T, U>,
    T: Send + Sync + 'static,
    R: Hook<Frame, ()>,
{
    fn call(&self, frame: &Frame, ctx: HookContext<Frame>) -> Call<Frame> {
        if let Some(frame) = frame.downcast_ref::<T>() {
            self.left.call(frame, ctx.cast()).cast()
        } else {
            self.right.call(frame, ctx)
        }
    }
}

impl<L, R> Hook<Frame, ()> for Stack<L, (), R>
where
    L: Hook<Frame, ()>,
    R: Hook<Frame, ()>,
{
    fn call(&self, frame: &Frame, ctx: HookContext<Frame>) -> Call<Frame> {
        let (ctx_left, ctx_right) = ctx.duplicate();

        match self.left.call(frame, ctx_left) {
            Call::Find(emit) => Call::Find(emit),
            Call::Miss(ctx) => self.right.call(frame, ctx),
        }
    }
}

/*
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
    ///     fmt::{Emit, HookContext, Hooks},
    ///     report, Report,
    /// };
    ///
    /// let hooks = Hooks::new() //
    ///     .push(|val: &u32| Emit::next(format!("{val}u32")))
    ///     .push(|_: &u64, ctx: &mut HookContext<u64>| {
    ///         Emit::defer(format!("u64 No. {}", ctx.increment()))
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
    pub fn push<H: Hook<F, U>, F: Send + Sync + 'static, U: sealed::Sealed>(
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
    ///     fmt::{Emit, HookContext, Hooks},
    ///     report, Report,
    /// };
    ///
    /// let other = Hooks::new()
    ///     .push(|val: &u32| Emit::next(format!("unsigned integer: {val}")))
    ///     .push(|_: &&str| Emit::next("You should have used `.attach_printable` ..."));
    ///
    /// let hooks = Hooks::new() //
    ///     .push(|val: &u32| Emit::next(format!("{val}u32")))
    ///     .push(|_: &u64, ctx: &mut HookContext<u64>| {
    ///         Emit::defer(format!("u64 No. {}", ctx.increment()))
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
    pub fn combine<U: Hook<Frame, ()>>(self, other: Hooks<U>) -> Hooks<Combine<T, U>> {
        let both = Combine::new(self.0, other.0);

        Hooks::new_with(both)
    }
*/

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
impl<L, R> Hook<Frame, ()> for Combine<L, R>
where
    L: Hook<Frame, ()>,
    R: Hook<Frame, ()>,
{
    fn call(&self, frame: &Frame, ctx: HookContext<Frame>) -> Option<Emit> {
        let parent = ctx.into_impl();

        self.left
            .call(frame, parent.cast())
            .or_else(|| self.right.call(frame, parent.cast()))
    }
}

fn main() {}

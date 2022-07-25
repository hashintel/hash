use alloc::collections::BTreeMap;
use core::{
    any::{Any, Demand, Provider, TypeId},
    marker::PhantomData,
};

pub use builtin::Builtin;

use crate::{
    fmt::{Instruction, Line, Lines},
    Frame,
};

pub(crate) struct HookContextImpl {
    pub(crate) text: Vec<Vec<String>>,
    inner: BTreeMap<TypeId, Box<dyn Any>>,
}

impl Default for HookContextImpl {
    fn default() -> Self {
        Self {
            text: vec![],
            inner: BTreeMap::new(),
        }
    }
}

impl HookContextImpl {
    pub(crate) fn cast<T>(&mut self) -> HookContext<T> {
        HookContext {
            parent: self,
            _marker: PhantomData::default(),
        }
    }

    pub(crate) fn text(&mut self, value: String) {
        self.text
            .push(value.lines().map(ToOwned::to_owned).collect())
    }
}

pub struct HookContext<'a, T> {
    parent: &'a mut HookContextImpl,
    _marker: PhantomData<T>,
}

impl<T> HookContext<'_, T> {
    pub fn text(&mut self, value: String) {
        self.text_lines(value.lines().map(ToOwned::to_owned));
    }

    pub fn text_lines<L: IntoIterator<Item = String>>(&mut self, lines: L) {
        self.parent.text.push(lines.into_iter().collect())
    }
}

impl<'a, T> HookContext<'a, T> {
    pub fn cast<U>(self) -> HookContext<'a, U> {
        HookContext {
            parent: self.parent,
            _marker: PhantomData::default(),
        }
    }

    fn into_impl(self) -> &'a mut HookContextImpl {
        self.parent
    }
}

impl<T: 'static> HookContext<'_, T> {
    pub fn get<U: 'static>(&self) -> Option<&U> {
        let id = TypeId::of::<T>();

        let inner = self.parent.inner.get(&id)?;
        inner.downcast_ref()
    }

    pub fn get_mut<U: 'static>(&mut self) -> Option<&mut U> {
        let id = TypeId::of::<T>();

        let inner = self.parent.inner.get_mut(&id)?;
        inner.downcast_mut()
    }

    pub fn insert<U: 'static>(&mut self, value: U) -> Option<Box<U>> {
        let id = TypeId::of::<T>();

        let inner = self.parent.inner.insert(id, Box::new(value))?;
        inner.downcast().ok()
    }
}

type UInt0 = ();
type UInt1 = ((), UInt0);
type UInt2 = ((), UInt1);

/// A single DebugHook of a specific type `T`, which a specific number of arguments `U`.
///
/// This trait is used for the implementation of
pub trait Hook<T, U> {
    fn call(&self, frame: &T, ctx: HookContext<T>) -> Option<Line>;
}

impl<F, T> Hook<T, UInt2> for F
where
    F: Fn(&T, &mut HookContext<T>) -> Line,
    T: Send + Sync + 'static,
{
    fn call(&self, frame: &T, mut ctx: HookContext<T>) -> Option<Line> {
        Some((self)(frame, &mut ctx))
    }
}

impl<F, T> Hook<T, UInt1> for F
where
    F: Fn(&T) -> Line,
    T: Send + Sync + 'static,
{
    fn call(&self, frame: &T, _: HookContext<T>) -> Option<Line> {
        Some((self)(frame))
    }
}

pub struct Stack<L, T, R> {
    left: L,
    right: R,
    _marker: PhantomData<T>,
}

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

impl<T> Hook<T, UInt0> for () {
    fn call(&self, _: &T, _: HookContext<T>) -> Option<Line> {
        None
    }
}

pub struct Both<L, R> {
    left: L,
    right: R,
}

impl<L, R> Hook<Frame, UInt0> for Both<L, R>
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

impl Hook<Frame, UInt0> for Box<dyn Hook<Frame, UInt0> + Send + Sync> {
    fn call(&self, frame: &Frame, ctx: HookContext<Frame>) -> Option<Line> {
        let hook = self.as_ref();

        hook.call(frame, ctx)
    }
}

pub struct Hooks<T: Hook<Frame, UInt0>>(T);

impl Hooks<Builtin> {
    pub fn new() -> Self {
        Self(Builtin)
    }
}

impl Hooks<()> {
    pub fn bare() -> Self {
        Self(())
    }
}

impl<T: Hook<Frame, UInt0>> Hooks<T> {
    fn new_with(hook: T) -> Self {
        Self(hook)
    }

    // TODO: potentially rename to `add()` instead.
    pub fn push<H: Hook<F, U>, F: Send + Sync + 'static, U>(
        self,
        hook: H,
    ) -> Hooks<Stack<H, (F, U), T>> {
        let stack = Stack {
            left: hook,
            right: self.0,
            _marker: PhantomData::default(),
        };

        Hooks::new_with(stack)
    }

    pub fn append<U: Hook<Frame, UInt0>>(self, other: Hooks<U>) -> Hooks<Both<T, U>> {
        let both = Both {
            left: self.0,
            right: other.0,
        };

        Hooks::new_with(both)
    }
}

impl<T: Hook<Frame, UInt0> + Send + Sync + 'static> Hooks<T> {
    pub fn erase(self) -> ErasedHooks {
        Hooks::new_with(Box::new(self.0))
    }
}

impl ErasedHooks {
    pub(crate) fn call(&self, frame: &Frame, ctx: &mut HookContextImpl) -> Option<Line> {
        self.0.call(frame, ctx.cast())
    }
}

pub type ErasedHooks = Hooks<Box<dyn Hook<Frame, UInt0> + Send + Sync>>;

mod builtin {
    #[cfg(all(nightly, feature = "std"))]
    use std::backtrace::Backtrace;

    #[cfg(feature = "spantrace")]
    use tracing_error::SpanTrace;

    use crate::{
        fmt::{
            hook::{Hook, HookContext, HookContextImpl, UInt0},
            Line,
        },
        Frame,
    };

    #[cfg(all(nightly, feature = "std"))]
    fn backtrace(backtrace: &Backtrace, ctx: &mut HookContext<Backtrace>) -> Line {
        let idx = match ctx.get::<usize>().copied() {
            None => {
                ctx.insert(0);
                0
            }
            Some(idx) => idx,
        };

        ctx.text(format!("Backtrace No. {}\n{}", idx + 1, backtrace));
        ctx.insert(idx + 1);

        Line::Defer(format!(
            "backtrace with {} frames ({})",
            backtrace.frames().len(),
            idx + 1
        ))
    }

    #[cfg(feature = "spantrace")]
    fn spantrace(spantrace: &SpanTrace, ctx: &mut HookContext<SpanTrace>) -> Line {
        let idx = match ctx.get::<usize>().copied() {
            None => {
                ctx.insert(0);
                0
            }
            Some(idx) => idx,
        };

        let mut span = 0;
        spantrace.with_spans(|_, _| {
            span += 1;
            true
        });

        ctx.text(format!("Span Trace No. {}\n{}", idx + 1, spantrace));
        ctx.insert(idx + 1);

        Line::Defer(format!("spantrace with {span} frames ({})", idx + 1))
    }

    pub struct Builtin;

    impl Hook<Frame, UInt0> for Builtin {
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

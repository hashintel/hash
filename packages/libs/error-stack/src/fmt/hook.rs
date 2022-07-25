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

pub struct AnyContext {
    pub(crate) text: Vec<Vec<String>>,
    inner: BTreeMap<TypeId, Box<dyn Any>>,
}

impl Default for AnyContext {
    fn default() -> Self {
        Self {
            text: vec![],
            inner: BTreeMap::new(),
        }
    }
}

impl AnyContext {
    fn cast<T>(&mut self) -> Context<T> {
        Context {
            parent: self,
            _marker: PhantomData::default(),
        }
    }

    pub(crate) fn text(&mut self, value: String) {
        self.text
            .push(value.lines().map(ToOwned::to_owned).collect())
    }
}

pub struct Context<'a, T> {
    parent: &'a mut AnyContext,
    _marker: PhantomData<T>,
}

impl<T> Context<'_, T> {
    pub fn text(&mut self, value: String) {
        self.text_lines(value.lines().map(ToOwned::to_owned));
    }

    pub fn text_lines<L: IntoIterator<Item = String>>(&mut self, lines: L) {
        self.parent.text.push(lines.into_iter().collect())
    }
}

impl<T: 'static> Context<'_, T> {
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

pub trait Hook<T> {
    fn call(&self, frame: &T, ctx: &mut AnyContext) -> Option<Line>;
}

impl<F, T> Hook<T> for F
where
    F: Fn(&T, &mut Context<T>) -> Line,
    T: Send + Sync + 'static,
{
    fn call(&self, frame: &T, ctx: &mut AnyContext) -> Option<Line> {
        Some((self)(frame, &mut ctx.cast()))
    }
}

pub struct Stack<L, T, R> {
    left: L,
    right: R,
    _marker: PhantomData<T>,
}

impl<L, T, R> Hook<Frame> for Stack<L, T, R>
where
    L: Hook<T>,
    T: Send + Sync + 'static,
    R: Hook<Frame>,
{
    fn call(&self, frame: &Frame, ctx: &mut AnyContext) -> Option<Line> {
        if let Some(frame) = frame.downcast_ref::<T>() {
            self.left.call(frame, ctx)
        } else {
            self.right.call(frame, ctx)
        }
    }
}

impl<T> Hook<T> for () {
    fn call(&self, _: &T, _: &mut AnyContext) -> Option<Line> {
        None
    }
}

pub struct Both<L, R> {
    left: L,
    right: R,
}

impl<L, R> Hook<Frame> for Both<L, R>
where
    L: Hook<Frame>,
    R: Hook<Frame>,
{
    fn call(&self, frame: &Frame, ctx: &mut AnyContext) -> Option<Line> {
        self.left
            .call(frame, ctx)
            .or_else(|| self.right.call(frame, ctx))
    }
}

impl Hook<Frame> for Box<dyn Hook<Frame> + Send + Sync> {
    fn call(&self, frame: &Frame, ctx: &mut AnyContext) -> Option<Line> {
        let hook = self.as_ref();

        hook.call(frame, ctx)
    }
}

pub struct Hooks<T: Hook<Frame>>(T);

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

impl<T: Hook<Frame>> Hooks<T> {
    fn new_with(hook: T) -> Self {
        Self(hook)
    }

    pub fn push<U: Hook<V>, V: Send + Sync + 'static>(self, hook: U) -> Hooks<Stack<U, V, T>> {
        let stack = Stack {
            left: hook,
            right: self.0,
            _marker: PhantomData::default(),
        };

        Hooks::new_with(stack)
    }

    pub fn append<U: Hook<Frame>>(self, other: Hooks<U>) -> Hooks<Both<T, U>> {
        let both = Both {
            left: self.0,
            right: other.0,
        };

        Hooks::new_with(both)
    }
}

impl<T: Hook<Frame> + Send + Sync + 'static> Hooks<T> {
    pub fn erase(self) -> ErasedHooks {
        Hooks::new_with(Box::new(self.0))
    }
}

impl ErasedHooks {
    pub fn call(&self, frame: &Frame, ctx: &mut AnyContext) -> Option<Line> {
        self.0.call(frame, ctx)
    }
}

pub type ErasedHooks = Hooks<Box<dyn Hook<Frame> + Send + Sync>>;

mod builtin {
    #[cfg(all(nightly, feature = "std"))]
    use std::backtrace::Backtrace;

    #[cfg(feature = "spantrace")]
    use tracing_error::SpanTrace;

    use crate::{
        fmt::{
            hook::{AnyContext, Context, Hook},
            Line,
        },
        Frame,
    };

    #[cfg(all(nightly, feature = "std"))]
    fn backtrace(backtrace: &Backtrace, ctx: &mut Context<Backtrace>) -> Line {
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
    fn spantrace(spantrace: &SpanTrace, ctx: &mut Context<SpanTrace>) -> Line {
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

    impl Hook<Frame> for Builtin {
        fn call(&self, frame: &Frame, ctx: &mut AnyContext) -> Option<Line> {
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

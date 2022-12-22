use alloc::{boxed::Box, vec::Vec};
use core::any::TypeId;

use crate::Frame;

pub struct Serde {}

pub type HookContext<T> = crate::hook::context::HookContext<Serde, T>;

fn serialize<'a, T: serde::Serialize + Send + Sync + 'static>(
    frame: &'a Frame,
) -> Option<Box<dyn erased_serde::Serialize + 'a>> {
    let value: &T = frame.request_ref()?;
    Some(Box::new(value))
}

// Thanks to https://users.rust-lang.org/t/hrtb-on-multiple-generics/34255/2 for the solution
pub trait DynamicFn<'a, I>: 'static
where
    I: Send + Sync + 'static,
{
    type Output: serde::Serialize + 'a;

    fn call(&self, value: &'a I, context: &mut HookContext<I>) -> Self::Output;

    fn erase(
        &self,
        value: &'a Frame,
        context: &mut HookContext<Frame>,
    ) -> Option<Box<dyn erased_serde::Serialize + 'a>>;
}

impl<'a, U: 'a, T, F> DynamicFn<'a, T> for F
where
    F: Fn(&'a T, &mut HookContext<T>) -> U,
    F: 'static,
    U: serde::Serialize,
    T: Send + Sync + 'static,
{
    type Output = U;

    fn call(&self, value: &'a T, context: &mut HookContext<T>) -> Self::Output {
        (self)(value, context)
    }

    fn erase(
        &self,
        value: &'a Frame,
        context: &mut HookContext<Frame>,
    ) -> Option<Box<dyn erased_serde::Serialize + 'a>> {
        let value = value.request_ref::<T>()?;

        let value = <Self as DynamicFn<'a, T>>::call(self, value, context.cast());

        Some(Box::new(value))
    }
}

type HookFnReturn<'a> = Option<Box<dyn erased_serde::Serialize + 'a>>;
type StaticHookFn = for<'a> fn(&'a Frame) -> HookFnReturn<'a>;
type DynamicHookFn = Box<
    dyn for<'a> Fn(
        &'a Frame,
        &mut HookContext<Frame>,
    ) -> Option<Box<dyn erased_serde::Serialize + 'a>>,
>;

enum HookFn {
    Static(StaticHookFn),
    Dynamic(DynamicHookFn),
}

struct Hook {
    ty: TypeId,
    hook: HookFn,
}

impl Hook {
    fn new_static<T: serde::Serialize + Send + Sync + 'static>() -> Self {
        Self {
            ty: TypeId::of::<T>(),
            hook: HookFn::Static(serialize::<T>),
        }
    }

    fn new_dynamic<F, I>(closure: F) -> Self
    where
        F: for<'a> DynamicFn<'a, I>,
        for<'a> <F as DynamicFn<'a, I>>::Output: serde::Serialize + 'a,
        I: Send + Sync + 'static,
    {
        fn dispatch<'a, F, I>(
            closure: &F,
            frame: &'a Frame,
            context: &mut HookContext<Frame>,
        ) -> Option<Box<dyn erased_serde::Serialize + 'a>>
        where
            F: for<'b> DynamicFn<'b, I>,
            for<'b> <F as DynamicFn<'b, I>>::Output: serde::Serialize + 'b,
            I: Send + Sync + 'static,
        {
            let value = frame.request_ref::<I>()?;
            let value = closure.call(value, context.cast());

            Some(Box::new(value))
        }

        let closure: DynamicHookFn =
            Box::new(move |frame: &Frame, context: &mut HookContext<Frame>| {
                dispatch::<_, I>(&closure, frame, context)
            });

        Self {
            ty: TypeId::of::<I>(),
            hook: HookFn::Dynamic(closure),
        }
    }

    fn call<'a>(
        &self,
        frame: &'a Frame,
        context: &mut HookContext<Frame>,
    ) -> Option<Box<dyn erased_serde::Serialize + 'a>> {
        match &self.hook {
            HookFn::Static(hook) => hook(frame),
            HookFn::Dynamic(hook) => hook(frame, context),
        }
    }
}

pub(crate) struct Hooks {
    inner: Vec<Hook>,
}

impl Hooks {
    pub(crate) fn insert_static<T: serde::Serialize + Send + Sync + 'static>(&mut self) {
        let type_id = TypeId::of::<T>();

        // make sure that previous hooks of the same TypeId are deleted
        self.inner.retain(|hook| hook.ty != type_id);
        self.inner.push(Hook::new_static::<T>());
    }

    pub(crate) fn insert_dynamic<F, I>(&mut self, closure: F)
    where
        F: for<'a> DynamicFn<'a, I>,
        for<'a> <F as DynamicFn<'a, I>>::Output: serde::Serialize + 'a,
        I: Send + Sync + 'static,
    {
        let type_id = TypeId::of::<I>();

        // make sure that previous hooks of the same TypeId are deleted
        self.inner.retain(|hook| hook.ty != type_id);
        self.inner.push(Hook::new_dynamic(closure));
    }

    pub(crate) fn call<'a>(
        &'a self,
        frame: &'a Frame,
        context: &'a mut HookContext<Frame>,
    ) -> impl Iterator<Item = Box<dyn erased_serde::Serialize + 'a>> + 'a + '_ {
        self.inner
            .iter()
            .filter_map(|hook| hook.call(frame, context))
    }
}

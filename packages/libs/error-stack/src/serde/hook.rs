use alloc::{boxed::Box, vec::Vec};
use core::any::TypeId;

use crate::Frame;

struct Serde {}

pub type HookContext<T> = crate::hook::context::HookContext<Serde, T>;

fn serialize<'a, T: serde::Serialize + Send + Sync + 'static>(
    frame: &'a Frame,
) -> Option<Box<dyn erased_serde::Serialize + 'a>> {
    let value: &T = frame.request_ref()?;
    Some(Box::new(value))
}

// Thanks to https://users.rust-lang.org/t/hrtb-on-multiple-generics/34255/2 for the solution
pub trait DynamicFn<'a> {
    type Output;
    type Input;

    fn call(
        &self,
        value: &'a Frame,
        context: &mut HookContext<Frame>,
    ) -> Option<dyn erased_serde::Serialize + 'a>;

    fn erase(self) -> Box<dyn DynamicFn<'a, Output = (), Input = ()>>;
}

impl<'a, U: 'a, T: Send + Sync + 'static, F> DynamicFn<'a> for F
where
    F: Fn(&'a T) -> U,
    U: serde::Serialize,
{
    type Input = T;
    type Output = U;

    fn call(
        &self,
        value: &'a Frame,
        context: &mut HookContext<Frame>,
    ) -> Option<dyn erased_serde::Serialize + 'a> {
        let value = value.request_ref::<T>()?;

        (self)(value, context.cast())
    }

    fn erase(self) -> Box<dyn DynamicFn<'a, Output = (), Input = ()>> {
        |frame, context| (self)(frame, context)
    }
}

type HookFnReturn<'a> = Option<Box<dyn erased_serde::Serialize + 'a>>;
type StaticHookFn = for<'a> fn(&'a Frame) -> HookFnReturn<'a>;
type DynamicHookFn = Box<dyn for<'a> DynamicFn<'a, Output = (), Input = ()>>;

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

    fn new_dynamic<F>(closure: F) -> Self
    where
        F: for<'a> DynamicFn<'a>,
        for<'a> <F as DynamicFn<'a>>::Input: Send + Sync + 'static,
        for<'a> <F as DynamicFn<'a>>::Output: serde::Serialize,
    {
        let closure = closure.erase();

        Self {
            ty: TypeId::of::<F::Input>(),
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

    // pub(crate) fn insert_dynamic<T: Send + Sync + 'static, U: serde::Serialize, F>(
    //     &mut self,
    //     closure: F,
    // ) where
    //     for<'a> F: Fn(&'a T, &mut HookContext<T>) -> U + 'a,
    // {
    //     let type_id = TypeId::of::<T>();
    //
    //     // make sure that previous hooks of the same TypeId are deleted
    //     self.inner.retain(|hook| hook.ty != type_id);
    //     self.inner.push(Hook::new_dynamic(closure));
    // }

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

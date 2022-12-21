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

type HookFnReturn<'a> = Option<Box<dyn erased_serde::Serialize + 'a>>;
type StaticHookFn = for<'a> fn(&'a Frame) -> HookFnReturn<'a>;
type DynamicHookFn = Box<dyn for<'a> Fn(&'a Frame, &mut HookContext<Frame>) -> HookFnReturn<'a>>;

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

    fn new_dynamic<T: Send + Sync + 'static, U: serde::Serialize, F>(closure: F) -> Self
    where
        for<'a> F: Fn(&'a T, &mut HookContext<T>) -> U + 'a,
    {
        // we need to use functions (instead of closures) here, as we're unable to specify any
        // lifetime parameters in closures
        fn dispatch<'a, F, T: Send + Sync + 'static, U: serde::Serialize + 'a>(
            closure: F,
            frame: &'a Frame,
            context: &mut HookContext<Frame>,
        ) -> Option<Box<dyn erased_serde::Serialize + 'a>>
        where
            F: FnOnce(&'a T, &mut HookContext<T>) -> U,
        {
            let value: &T = frame.request_ref()?;
            let value = closure(value, context.cast());

            Some(Box::new(value))
        }

        // TODO: lifetime of dyn serialize
        let closure: DynamicHookFn =
            Box::new(move |frame: &Frame, context: &mut HookContext<Frame>| {
                dispatch(&closure, frame, context)
            });

        Self {
            ty: TypeId::of::<T>(),
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

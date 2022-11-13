use alloc::{boxed::Box, format, string::String, sync::Arc, vec::Vec};
use core::{
    alloc::Layout,
    any::TypeId,
    cell::Cell,
    fmt,
    fmt::{Display, Formatter},
    hint::spin_loop,
    marker::PhantomData,
    ptr,
    ptr::NonNull,
    sync::atomic::{AtomicI8, Ordering},
};

use arc_swap::ArcSwap;
use bumpalo::Bump;
use bumpalo_herd::Herd;
use elsa::{FrozenMap, FrozenVec};
use error_stack::Frame;
use im::Vector;
use serde::{
    ser::{Error as _, SerializeMap},
    Serialize, Serializer,
};

use crate::error::{Error, ErrorProperties, Id, Namespace};

struct ErrorMessage<'a, 'b, E: Error> {
    context: &'a E,
    properties: &'b <E::Properties as ErrorProperties>::Value<'a>,
}

impl<'a, 'b, E: Error> Display for ErrorMessage<'a, 'b, E> {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        self.context.message(f, self.properties)
    }
}

struct SerializeErrorProperties<'a, E: Error>(
    Cell<Option<<E::Properties as ErrorProperties>::Value<'a>>>,
);

impl<'a, E: Error> SerializeErrorProperties<'a, E> {
    const fn new(value: <E::Properties as ErrorProperties>::Value<'a>) -> Self {
        Self(Cell::new(Some(value)))
    }
}

impl<'a, E: Error> Serialize for SerializeErrorProperties<'a, E> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(None)?;

        let value = self
            .0
            .replace(None)
            .expect("serialize cannot be called multiple times");

        E::Properties::output(value, &mut map).map_err(|err| S::Error::custom(format!("{err}")))?;

        map.end()
    }
}

#[derive(serde::Serialize)]
struct SerializeError<'a> {
    namespace: &'static Namespace,
    id: &'static Id,

    properties: Box<dyn erased_serde::Serialize + 'a>,
    message: String,
}

type Hook = Box<dyn for<'a> Fn(&[&'a Frame]) -> Option<Box<dyn erased_serde::Serialize + 'a>>>;

// static ARENA: Herd = Herd::new();

// TODO: build our own?!
// TODO: builtin, switch arc-swap with std equivalent
// TODO: THIS IS NOT SYNC, THEREFORE WON'T WORK WITH STATIC!
pub(crate) struct Hooks {
    // TODO: i'd like to remove this box
    inner: ArcSwap<Vector<&'static [ErrorHook]>>,
}

impl Hooks {
    fn new() -> Self {
        Self {
            inner: ArcSwap::new(Arc::new(Vector::new())),
        }
    }

    // fn insert<E: Error>(&self) {
    //     let tid = TypeId::of::<E>();
    //
    //     if self.inner.iter().any(|id| *id == tid) {
    //         return;
    //     }
    //
    //     let closure: Hook = Box::new(move |stack: &[&Frame]| {
    //         let context = *stack.last()?;
    //         let context: &E = context.downcast_ref::<E>()?;
    //
    //         let properties = E::Properties::value(stack);
    //
    //         let fmt = ErrorMessage {
    //             context,
    //             properties: &properties,
    //         };
    //
    //         let message = format!("{fmt}");
    //
    //         Some(Box::new(SerializeError {
    //             namespace: &E::NAMESPACE,
    //             id: &E::ID,
    //             properties: Box::new(SerializeErrorProperties::<E>::new(properties)),
    //             message,
    //         }))
    //     });
    //
    //     self.inner.push(Box::new(tid));
    //     self.hooks.insert(tid, closure);
    // }
}

// static HOOKS: Hooks = Hooks::new();

fn register_inner<'a, E: Error>(
    stack: &[&'a Frame],
) -> Option<Box<dyn erased_serde::Serialize + 'a>> {
    let context = *stack.last()?;
    let context: &E = context.downcast_ref::<E>()?;

    let properties = E::Properties::value(stack);

    let fmt = ErrorMessage {
        context,
        properties: &properties,
    };

    let message = format!("{fmt}");

    Some(Box::new(SerializeError {
        namespace: &E::NAMESPACE,
        id: &E::ID,
        properties: Box::new(SerializeErrorProperties::<E>::new(properties)),
        message,
    }))
}

static HOOKS: Hooks = Hooks::new();

struct ErrorHook {
    id: TypeId,
    hook: for<'a> fn(&[&'a Frame]) -> Option<Box<dyn erased_serde::Serialize + 'a>>,
}

fn prepare<E: Error>() -> ErrorHook {
    ErrorHook {
        id: TypeId::of::<E>(),
        hook: register_inner::<E>,
    }
}

fn register(hooks: &'static [ErrorHook]) {
    let mut value = Vector::clone(&HOOKS.inner.load_full());
    value.push_back(hooks);
    HOOKS.inner.store(Arc::new(value));
}

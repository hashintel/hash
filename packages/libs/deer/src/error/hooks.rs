use alloc::{boxed::Box, format, string::String};
use core::{
    any::TypeId,
    cell::Cell,
    fmt,
    fmt::{Display, Formatter},
    sync::atomic::{AtomicBool, Ordering},
};

use deer_append_vec::AppendOnlyVec;
use error_stack::Frame;
use serde::{
    ser::{Error as _, SerializeMap},
    Serialize, Serializer,
};

use crate::error::{
    ArrayLengthError, Error, ErrorProperties, Id, MissingError, Namespace, ObjectItemsExtraError,
    TypeError, UnknownFieldError, UnknownVariantError, ValueError,
};

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

#[derive(Copy, Clone)]
pub struct Hook {
    id: TypeId,
    hook: for<'a> fn(&[&'a Frame]) -> Option<Box<dyn erased_serde::Serialize + 'a>>,
}

impl Hook {
    pub fn new<E: Error>() -> Self {
        Self {
            id: TypeId::of::<E>(),
            hook: register_inner::<E>,
        }
    }
}

pub(crate) struct Hooks {
    inner: AppendOnlyVec<Hook>,
    init: AtomicBool,
}

impl Hooks {
    const fn new() -> Self {
        Self {
            inner: AppendOnlyVec::new(),
            init: AtomicBool::new(false),
        }
    }

    fn push_builtin(&self) {
        if self
            .init
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            // we already initiated, and therefore need to stop
            return;
        }

        // these need to be called separately
        self.push(&[
            Hook::new::<TypeError>(),
            Hook::new::<ValueError>(),
            Hook::new::<MissingError>(),
            Hook::new::<UnknownVariantError>(),
            Hook::new::<UnknownFieldError>(),
            Hook::new::<ObjectItemsExtraError>(),
            Hook::new::<ArrayLengthError>(),
        ]);
    }

    fn push(&self, hooks: &[Hook]) {
        self.push_builtin();

        for hook in hooks {
            self.inner.push(*hook);
        }
    }
}

static HOOKS: Hooks = Hooks::new();

#[macro_export]
macro_rules! register_many {
    (($ty:ident,)*) => {
        $crate::error::__private::register_many(&[$($crate::error::Hook::new::<$ty>(),)*])
    };
}

pub use register_many;

pub fn register_many_hooks(hooks: &[Hook]) {
    HOOKS.push(hooks);
}

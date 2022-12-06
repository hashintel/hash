use std::any::{Any, TypeId};

use serde::{Serialize, Serializer as _};

use crate::Frame;

struct HookContext {}

struct Serializer {
    inner: Box<dyn Any + Send + Sync>,
    consume: fn(Box<dyn Any + Send + Sync>),
}

impl Serializer {
    fn serialize<S: Serialize>(self, value: S) -> Result<(), ()> {}
}

fn serialize<T: serde::Serialize>(
    frame: &Frame,
    serializer: Box<dyn erased_serde::Serializer>,
) -> Option<erased_serde::Result<()>> {
    let value: &T = frame.request_ref()?;
    Some(value.serialize(serializer))
}

// TODO: Storage coming later

enum HookFn {
    Static(fn(&Frame, Box<dyn erased_serde::Serializer>) -> Option<erased_serde::Result<()>>),
    Dynamic(Box<dyn Fn(&Frame, &mut HookContext, Box<dyn erased_serde::Serializer>) -> ()>),
}

struct Hook {
    ty: TypeId,
    hook: fn(&Frame),
}

pub(crate) struct Hooks {
    pub(crate) inner: Vec<TypeId>,
}

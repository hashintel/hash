use std::any::TypeId;

use serde::{Serialize, Serializer};

use crate::Frame;

fn serialize<T: serde::Serialize>(
    frame: &Frame,
    serializer: Box<dyn erased_serde::Serializer>,
) -> Option<Result<erased_serde::>> {
    let value: &T = frame.request_ref()?;
    Some(value.serialize(serializer))
}

pub(crate) struct Hooks {
    pub(crate) inner: Vec<TypeId>,
}

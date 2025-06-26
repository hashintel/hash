use alloc::rc::Rc;

use super::Value;
use crate::symbol::Symbol;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Opaque<'heap> {
    name: Symbol<'heap>,
    value: Rc<Value<'heap>>,
}

impl<'heap> Opaque<'heap> {
    pub fn new(name: Symbol<'heap>, value: impl Into<Rc<Value<'heap>>>) -> Self {
        Self {
            name,
            value: value.into(),
        }
    }

    #[must_use]
    pub const fn name(&self) -> Symbol<'heap> {
        self.name
    }

    #[must_use]
    pub fn value(&self) -> &Value<'heap> {
        &self.value
    }
}

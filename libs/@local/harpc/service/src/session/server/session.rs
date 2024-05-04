use core::any::{Any, TypeId};
use std::collections::HashMap;

pub(crate) struct Session {
    context: HashMap<TypeId, Box<dyn Any + Send + Sync + 'static>>,
}

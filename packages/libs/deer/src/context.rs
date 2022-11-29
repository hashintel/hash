use alloc::{boxed::Box, collections::BTreeMap};
use core::any::{Any, TypeId};

pub struct Context {
    inner: BTreeMap<TypeId, Box<dyn Any>>,
}

impl Context {
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: BTreeMap::new(),
        }
    }

    pub fn insert<T: 'static>(&mut self, value: T) -> &mut Self {
        let type_id = TypeId::of::<T>();
        self.inner.insert(type_id, Box::new(value));

        self
    }

    pub fn remove<T: 'static>(&mut self) -> Option<T> {
        let type_id = TypeId::of::<T>();

        self.inner
            .remove(&type_id)
            .and_then(|value| value.downcast().ok())
            .map(|value| *value)
    }

    #[must_use]
    pub fn clear(&mut self) {
        self.inner.clear();
    }

    #[must_use]
    pub fn contains<T: 'static>(&self) -> bool {
        let type_id = TypeId::of::<T>();

        self.inner.contains_key(&type_id)
    }

    #[must_use]
    pub fn request_ref<T: 'static>(&self) -> Option<&T> {
        let type_id = TypeId::of::<T>();

        self.inner
            .get(&type_id)
            .and_then(|value| value.downcast_ref())
    }
}

impl Default for Context {
    fn default() -> Self {
        Self::new()
    }
}

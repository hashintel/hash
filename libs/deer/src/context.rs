#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::boxed::Box;
use alloc::collections::BTreeMap;
use core::any::{Any, TypeId};

#[derive(Debug)]
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

        let value = self.inner.remove(&type_id)?;
        value.downcast().ok().map(|value| *value)
    }

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
        #[expect(
            clippy::coerce_container_to_any,
            reason = "False positive: https://github.com/rust-lang/rust-clippy/issues/15045"
        )]
        self.inner.get(&TypeId::of::<T>())?.downcast_ref()
    }
}

impl Default for Context {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert() {
        let mut context = Context::new();
        context.insert(0_u8);

        let has_u8 = context.inner.keys().any(|id| *id == TypeId::of::<u8>());
        assert!(has_u8);
    }

    #[test]
    fn remove() {
        let mut context = Context::new();

        context.insert::<u8>(0_u8);
        context.insert::<u16>(0_u16);
        assert_eq!(context.inner.len(), 2);

        let value = context.remove::<u8>();
        assert_eq!(value, Some(0));
        assert_eq!(context.inner.len(), 1);
    }

    #[test]
    fn clear() {
        let mut context = Context::new();

        context.insert::<u8>(0_u8);
        context.insert::<u16>(0_u16);
        assert_eq!(context.inner.len(), 2);

        context.clear();
        assert_eq!(context.inner.len(), 0);
    }

    #[test]
    fn contains() {
        let mut context = Context::new();

        context.insert::<u8>(0_u8);
        context.insert::<u16>(0_u16);

        assert!(context.contains::<u8>());
        assert!(context.contains::<u16>());
        assert!(!context.contains::<u32>());
    }

    #[test]
    fn request_ref() {
        let mut context = Context::new();

        context.insert::<u8>(3_u8);

        assert_eq!(context.request_ref::<u8>(), Some(&3_u8));
    }
}

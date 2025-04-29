use alloc::rc::Rc;
use core::{cell::RefCell, hash::Hash};

use crate::collection::FastHashMap;

pub struct ReplacementGuard<T: Copy + Eq + Hash> {
    inner: Rc<ReplacementScope<T>>,

    items: Vec<(T, Option<T>)>,
}

impl<T> Drop for ReplacementGuard<T>
where
    T: Copy + Eq + Hash,
{
    fn drop(&mut self) {
        self.inner.exit(&mut self.items);
    }
}

#[derive(Debug)]
pub(crate) struct ReplacementScope<T> {
    // For the motivation of using RefCell, please refer to the documentation on
    // `ProvisionedScope`.
    lookup: RefCell<FastHashMap<T, T>>,
}

impl<T> ReplacementScope<T>
where
    T: Copy + Eq + Hash,
{
    pub(crate) fn enter_many(self: Rc<Self>, items: Vec<(T, T)>) -> ReplacementGuard<T> {
        let mut lookup = self.lookup.borrow_mut();
        let items = items
            .into_iter()
            .map(|(original, replacement)| {
                let previous = lookup.insert(original, replacement);
                (original, previous)
            })
            .collect();
        drop(lookup);

        ReplacementGuard { inner: self, items }
    }

    pub(crate) fn exit(&self, items: &mut Vec<(T, Option<T>)>) {
        if items.is_empty() {
            return;
        }

        let mut lookup = self.lookup.borrow_mut();

        for (original, previous) in items.drain(..) {
            if let Some(previous) = previous {
                lookup.insert(original, previous);
            } else {
                lookup.remove(&original);
            }
        }
    }

    pub(crate) fn lookup(&self, id: T) -> Option<T> {
        self.lookup.borrow().get(&id).copied()
    }
}

impl<T> Default for ReplacementScope<T> {
    fn default() -> Self {
        Self {
            lookup: RefCell::default(),
        }
    }
}

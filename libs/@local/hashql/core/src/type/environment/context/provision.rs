use alloc::rc::Rc;

use crate::{collections::FastHashMap, id::Id, intern::Provisioned, sync::lock::LocalLock};

pub struct ProvisionedGuard<T: Id> {
    inner: Rc<ProvisionedScope<T>>,

    id: T,
    provisioned: Provisioned<T>,
    previous: Option<Provisioned<T>>,
}

impl<T> ProvisionedGuard<T>
where
    T: Id,
{
    pub(crate) fn is_used(&self) -> bool {
        self.inner.is_used(self.provisioned)
    }
}

impl<T> Drop for ProvisionedGuard<T>
where
    T: Id,
{
    fn drop(&mut self) {
        self.inner.exit(self);
    }
}

/// Manages provisional type mappings during the type simplification process.
///
/// This struct holds the forward (`T` -> `Provisioned<T>`) and reverse
/// (`Provisioned<T>` -> `T`) mappings used to track types that have been
/// temporarily 'provisioned' (allocated a placeholder ID) before their final
/// simplified form is determined and interned.
///
/// It is shared via `Rc` between the `SimplifyEnvironment` and active `ProvisionGuard`
/// instances, enabling RAII cleanup of provisional mappings when guards go out of scope.
#[derive(Debug)]
pub(crate) struct ProvisionedScope<T> {
    forward: LocalLock<FastHashMap<T, Provisioned<T>>>,
    reverse: LocalLock<FastHashMap<Provisioned<T>, (usize, T)>>,
}

impl<T> ProvisionedScope<T>
where
    T: Id,
{
    pub(crate) fn enter(self: Rc<Self>, id: T, provisioned: Provisioned<T>) -> ProvisionedGuard<T> {
        let previous = self.forward.map(|forward| forward.insert(id, provisioned));

        self.reverse
            .map(|reverse| reverse.insert(provisioned, (0, id)));

        ProvisionedGuard {
            inner: Rc::clone(&self),
            id,
            provisioned,
            previous,
        }
    }

    fn exit(&self, guard: &ProvisionedGuard<T>) {
        self.forward.map(|forward| {
            if let Some(previous) = guard.previous {
                forward.insert(guard.id, previous);
            } else {
                forward.remove(&guard.id);
            }
        });

        self.reverse.map(|reverse| {
            reverse.remove(&guard.provisioned);
        });
    }

    pub(crate) fn get_substitution(&self, id: T) -> Option<T> {
        let value = {
            let provisioned = self.forward.map(|forward| forward.get(&id).copied())?;

            self.reverse.map(|reverse| {
                reverse.get_mut(&provisioned).expect("should exist").0 += 1;
            });

            provisioned
        };

        Some(value.value())
    }

    pub(crate) fn get_source(&self, id: T) -> Option<T> {
        let value = {
            let mut guard = self.reverse.lock();

            let (access, value) = guard.get_mut(&id)?;
            *access += 1;
            let value = *value;

            drop(guard);

            value
        };

        Some(value)
    }

    pub(crate) fn is_used(&self, id: Provisioned<T>) -> bool {
        self.reverse
            .map(|reverse| reverse.get(&id).is_some_and(|&(access, _)| access > 0))
    }
}

impl<T> Default for ProvisionedScope<T> {
    fn default() -> Self {
        Self {
            forward: LocalLock::default(),
            reverse: LocalLock::default(),
        }
    }
}

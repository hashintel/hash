use alloc::rc::Rc;
use core::cell::RefCell;

use crate::{collection::FastHashMap, id::Id, intern::Provisioned};

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
///
/// ## Implementation Details: `RefCell` Usage
///
/// The `forward` and `reverse` maps are wrapped in `RefCell` for the following reasons:
///
/// 1. **Shared Ownership (`Rc`)**: The `Provision` struct itself is wrapped in an `Rc`. This allows
///    shared ownership between the `SimplifyEnvironment` and multiple active `ProvisionGuard`
///    instances.
///
/// 2. **Interior Mutability for Guards**: `ProvisionGuard` instances need to modify the `forward`
///    and `reverse` maps within their `Drop` implementation for RAII cleanup (removing the
///    provisional mappings they created). Since the `Provision` data is shared via `Rc`, direct
///    mutable borrowing (`&mut`) isn't possible from the guards. `RefCell` provides the necessary
///    interior mutability, allowing `borrow_mut()` within the guard's `drop` method (specifically,
///    in `Provision::exit`).
///
/// 3. **Enabling Mutation via Shared Reference (`Rc`)**: The core challenge is that
///    `ProvisionGuard` needs to mutate the `Provision` state during `drop`, but it only holds an
///    `Rc<Provision>` (a shared reference). `RefCell` provides the mechanism (`borrow_mut()`) to
///    achieve this *interior mutability*. The safety of these mutations, and reads like
///    `substitute`, (i.e., preventing conflicting borrows at runtime) is guaranteed because all
///    operations accessing the `Provision` struct occur through `SimplifyEnvironment` methods that
///    require `&mut self`. This `&mut self` ensures exclusive access to the `SimplifyEnvironment`
///    (and thus indirectly to the `Provision` maps) within the single thread at any given time.
///
/// 4. **Single-Threaded Context**: This approach relies on the assumption of a single-threaded
///    execution environment (consistent with `Heap` not being thread-safe). `RefCell` is suitable
///    here; a `Mutex` would be unnecessary overhead.
///
/// **In Summary**: `RefCell` is used here primarily because `Provision` is shared via `Rc`. It
/// provides the necessary *interior mutability* for `ProvisionGuard`'s RAII cleanup
/// (`Drop` impl) to modify the shared state through the `Rc`. The exclusive `&mut self`
/// required by the public methods of `SimplifyEnvironment` that interact with `Provision`
/// guarantees that there are no concurrent accesses within the same thread, making the use
/// of `RefCell` safe without needing a `Mutex`.
#[derive(Debug)]
pub(crate) struct ProvisionedScope<T> {
    forward: RefCell<FastHashMap<T, Provisioned<T>>>,
    reverse: RefCell<FastHashMap<Provisioned<T>, (usize, T)>>,
}

impl<T> ProvisionedScope<T>
where
    T: Id,
{
    pub(crate) fn enter(self: Rc<Self>, id: T, provisioned: Provisioned<T>) -> ProvisionedGuard<T> {
        let previous = { self.forward.borrow_mut().insert(id, provisioned) };

        self.reverse.borrow_mut().insert(provisioned, (0, id));

        ProvisionedGuard {
            inner: Rc::clone(&self),
            id,
            provisioned,
            previous,
        }
    }

    fn exit(&self, guard: &ProvisionedGuard<T>) {
        if let Some(previous) = guard.previous {
            self.forward.borrow_mut().insert(guard.id, previous);
        } else {
            self.forward.borrow_mut().remove(&guard.id);
        }

        self.reverse.borrow_mut().remove(&guard.provisioned);
    }

    pub(crate) fn get_substitution(&self, id: T) -> Option<T> {
        self.forward
            .borrow()
            .get(&id)
            .map(|provisioned| provisioned.value())
    }

    pub(crate) fn get_source(&self, id: T) -> Option<T> {
        let value = {
            let mut guard = self.reverse.borrow_mut();

            let (access, value) = guard.get_mut(&id)?;
            *access += 1;

            *value
        };

        Some(value)
    }

    pub(crate) fn is_used(&self, id: Provisioned<T>) -> bool {
        self.reverse
            .borrow()
            .get(&id)
            .is_some_and(|&(access, _)| access > 0)
    }
}

impl<T> Default for ProvisionedScope<T> {
    fn default() -> Self {
        Self {
            forward: RefCell::default(),
            reverse: RefCell::default(),
        }
    }
}

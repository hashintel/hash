use alloc::{collections::BTreeSet, vec, vec::Vec};

/// The dependencies between the items of a list, by position.
#[derive(Debug)]
pub(super) struct Dependencies(Vec<BTreeSet<usize>>);

impl Dependencies {
    /// Starts with `count` items and no dependencies between them.
    pub(super) fn new(count: usize) -> Self {
        Self(vec![BTreeSet::new(); count])
    }

    /// Records that the item at `dependent` must come after the item at `dependency`.
    ///
    /// # Panics
    ///
    /// Panics if `dependent` or `dependency` is not the position of an item.
    pub(super) fn insert(&mut self, dependent: usize, dependency: usize) {
        assert!(
            dependency < self.0.len(),
            "dependency {dependency} should be the position of an item"
        );
        self.0
            .get_mut(dependent)
            .expect("dependent should be the position of an item")
            .insert(dependency);
    }

    /// Orders the items so that each comes after its dependencies.
    ///
    /// Among the items that are ready, the one declared first comes first, so the order keeps
    /// declaration order where dependencies allow it.
    ///
    /// # Errors
    ///
    /// Returns the items that cannot be ordered, in declaration order. Each is in a cycle or
    /// depends on an item in one.
    pub(super) fn run_order(&self) -> Result<Vec<usize>, Vec<usize>> {
        let count = self.0.len();
        let mut waiting_on = vec![0_usize; count];
        let mut dependents = vec![Vec::new(); count];
        for (dependent, dependencies) in self.0.iter().enumerate() {
            for &dependency in dependencies {
                if let (Some(waiting), Some(list)) = (
                    waiting_on.get_mut(dependent),
                    dependents.get_mut(dependency),
                ) {
                    *waiting += 1;
                    list.push(dependent);
                }
            }
        }

        let mut ready: BTreeSet<usize> = waiting_on
            .iter()
            .enumerate()
            .filter(|&(_, &waiting)| waiting == 0)
            .map(|(item, _)| item)
            .collect();
        let mut order = Vec::with_capacity(count);

        while let Some(item) = ready.pop_first() {
            order.push(item);
            for &dependent in dependents.get(item).into_iter().flatten() {
                if let Some(waiting) = waiting_on.get_mut(dependent) {
                    *waiting -= 1;
                    if *waiting == 0 {
                        ready.insert(dependent);
                    }
                }
            }
        }

        if order.len() == count {
            Ok(order)
        } else {
            Err(waiting_on
                .iter()
                .enumerate()
                .filter(|&(_, &waiting)| waiting > 0)
                .map(|(item, _)| item)
                .collect())
        }
    }
}

#[cfg(test)]
mod tests {
    use alloc::vec;

    use super::Dependencies;

    #[test]
    fn run_order_keeps_declaration_order() {
        let mut dependencies = Dependencies::new(4);
        dependencies.insert(0, 2);
        assert_eq!(
            dependencies.run_order(),
            Ok(vec![1, 2, 0, 3]),
            "only item 0 should move, to just after its dependency"
        );
    }

    #[test]
    fn run_order_cycle() {
        let mut dependencies = Dependencies::new(4);
        dependencies.insert(1, 2);
        dependencies.insert(2, 1);
        dependencies.insert(3, 2);
        assert_eq!(
            dependencies.run_order(),
            Err(vec![1, 2, 3]),
            "the cycle and the item that depends on it should be reported"
        );
    }
}

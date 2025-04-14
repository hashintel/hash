use core::ops::Index;

use crate::id::{HasId, Id as _};

const INLINE_CAPACITY: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Checkpoint<T>(rpds::Vector<T>);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TransactionalArena<T> {
    items: rpds::Vector<T>,
}

impl<T> TransactionalArena<T> {
    pub fn new() -> Self {
        Self {
            items: rpds::Vector::new(),
        }
    }

    fn next_id(&self) -> usize {
        self.items.len()
    }

    pub fn push_with(&mut self, item: impl FnOnce(T::Id) -> T) -> T::Id
    where
        T: HasId,
    {
        let id = T::Id::from_usize(self.next_id());

        self.items.push_back_mut(item(id));
        id
    }

    pub fn push(&mut self, item: T) -> T::Id
    where
        T: HasId,
    {
        let id = T::Id::from_usize(self.next_id());

        self.items.push_back_mut(item);
        id
    }

    pub fn update(&mut self, item: T)
    where
        T: HasId,
    {
        let id = item.id();

        let inserted = self.items.set_mut(id.as_usize(), item);
        assert!(inserted, "Item with id {id} not found");
    }

    pub fn update_with(&mut self, id: T::Id, closure: impl FnOnce(&mut T))
    where
        T: HasId + Clone,
    {
        let Some(item) = self.items.get_mut(id.as_usize()) else {
            panic!("Item with id {id} not found")
        };

        closure(item);
    }

    pub fn get(&self, id: T::Id) -> Option<&T>
    where
        T: HasId,
    {
        self.items.get(id.as_usize())
    }

    pub fn get_mut(&mut self, id: T::Id) -> Option<&mut T>
    where
        T: HasId + Clone,
    {
        self.items.get_mut(id.as_usize())
    }

    pub fn checkpoint(&self) -> Checkpoint<T> {
        Checkpoint(self.items.clone())
    }

    pub fn restore(&mut self, checkpoint: Checkpoint<T>) {
        self.items = checkpoint.0;
    }
}

impl<T> Index<T::Id> for TransactionalArena<T>
where
    T: HasId,
{
    type Output = T;

    fn index(&self, id: T::Id) -> &Self::Output {
        self.items
            .get(id.as_usize())
            .expect("Item with id {id} not found")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::newtype;

    newtype!(
        pub struct TestId(u32 is 0..=0xFFFF_FF00)
    );

    // A simple test struct that implements HasId
    #[derive(Debug, Clone, PartialEq)]
    struct TestItem {
        id: TestId,
        value: String,
    }

    impl HasId for TestItem {
        type Id = TestId;

        fn id(&self) -> Self::Id {
            self.id
        }
    }

    #[test]
    fn new_arena_is_empty() {
        let arena: TransactionalArena<TestItem> = TransactionalArena::new();
        assert_eq!(arena.next_id(), 0);
    }

    #[test]
    fn push() {
        let mut arena = TransactionalArena::new();
        let item = TestItem {
            id: TestId(0),
            value: "test".to_string(),
        };

        let id = arena.push(item);
        assert_eq!(id, TestId(0));

        let retrieved = arena.get(TestId(0)).expect("item should exist");
        assert_eq!(retrieved.value, "test");
    }

    #[test]
    fn push_with() {
        let mut arena = TransactionalArena::new();

        let id = arena.push_with(|id| TestItem {
            id,
            value: format!("test_{}", id),
        });

        assert_eq!(id, TestId(0));
        let item = arena.get(id).expect("item should exist");
        assert_eq!(item.value, "test_0");
    }

    #[test]
    fn update() {
        let mut arena = TransactionalArena::new();

        let id = arena.push_with(|id| TestItem {
            id,
            value: "original".to_string(),
        });

        let updated_item = TestItem {
            id,
            value: "updated".to_string(),
        };
        arena.update(updated_item);

        let retrieved = arena.get(id).expect("item should exist");
        assert_eq!(retrieved.value, "updated");
    }

    #[test]
    #[should_panic(expected = "Item with id 0 not found")]
    fn update_nonexistent() {
        let mut arena = TransactionalArena::new();

        let item = TestItem {
            id: TestId(0),
            value: "test".to_string(),
        };

        arena.update(item); // Should panic
    }

    #[test]
    fn update_with() {
        let mut arena = TransactionalArena::new();

        let id = arena.push_with(|id| TestItem {
            id,
            value: "original".to_string(),
        });

        arena.update_with(id, |item| {
            item.value = "modified".to_string();
        });

        let retrieved = arena.get(id).expect("item should exist");
        assert_eq!(retrieved.value, "modified");
    }

    #[test]
    #[should_panic(expected = "Item with id 0 not found")]
    fn update_with_nonexistent() {
        let mut arena = TransactionalArena::<TestItem>::new();
        arena.update_with(TestId(0), |item| {
            item.value = "test".to_string();
        }); // Should panic
    }

    #[test]
    fn get_nonexistent() {
        let arena: TransactionalArena<TestItem> = TransactionalArena::new();
        assert!(arena.get(TestId(0)).is_none());
    }

    #[test]
    fn checkpoint_and_restore() {
        let mut arena = TransactionalArena::new();

        // Add initial item
        let id = arena.push_with(|id| TestItem {
            id,
            value: "original".to_string(),
        });

        // Create checkpoint
        let checkpoint = arena.checkpoint();

        // Modify item
        arena.update_with(id, |item| {
            item.value = "modified".to_string();
        });

        // Verify modification
        assert_eq!(arena.get(id).expect("item should exist").value, "modified");

        // Restore checkpoint
        arena.restore(checkpoint);

        // Verify restoration
        assert_eq!(arena.get(id).expect("item should exist").value, "original");
    }

    #[test]
    fn get_mut() {
        let mut arena = TransactionalArena::new();

        let id = arena.push_with(|id| TestItem {
            id,
            value: "original".to_string(),
        });

        // Modify through get_mut
        if let Some(item) = arena.get_mut(id) {
            item.value = "changed".to_string();
        }

        assert_eq!(arena.get(id).expect("item should exist").value, "changed");
    }

    #[test]
    fn multiple_items() {
        let mut arena = TransactionalArena::new();

        // Add multiple items
        let id1 = arena.push_with(|id| TestItem {
            id,
            value: "first".to_string(),
        });

        let id2 = arena.push_with(|id| TestItem {
            id,
            value: "second".to_string(),
        });

        let id3 = arena.push_with(|id| TestItem {
            id,
            value: "third".to_string(),
        });

        // Verify all items
        assert_eq!(arena.get(id1).expect("item should exist").value, "first");
        assert_eq!(arena.get(id2).expect("item should exist").value, "second");
        assert_eq!(arena.get(id3).expect("item should exist").value, "third");

        // Verify IDs are sequential
        assert_eq!(id1, TestId(0));
        assert_eq!(id2, TestId(1));
        assert_eq!(id3, TestId(2));
    }

    #[test]
    fn index() {
        let mut arena = TransactionalArena::new();

        // Add multiple items
        let id1 = arena.push_with(|id| TestItem {
            id,
            value: "first".to_string(),
        });

        let id2 = arena.push_with(|id| TestItem {
            id,
            value: "second".to_string(),
        });

        let id3 = arena.push_with(|id| TestItem {
            id,
            value: "third".to_string(),
        });

        // Verify all items
        assert_eq!(arena[id1].value, "first");
        assert_eq!(arena[id2].value, "second");
        assert_eq!(arena[id3].value, "third");
    }

    #[test]
    fn nested_checkpoints() {
        let mut arena = TransactionalArena::new();

        // Initial state
        let id = arena.push_with(|id| TestItem {
            id,
            value: "initial".to_string(),
        });

        // First checkpoint
        let checkpoint1 = arena.checkpoint();

        // First modification
        arena.update_with(id, |item| {
            item.value = "first_mod".to_string();
        });

        // Second checkpoint
        let checkpoint2 = arena.checkpoint();

        // Second modification
        arena.update_with(id, |item| {
            item.value = "second_mod".to_string();
        });

        // Third checkpoint
        let checkpoint3 = arena.checkpoint();

        // Third modification
        arena.update_with(id, |item| {
            item.value = "third_mod".to_string();
        });

        // Verify current state
        assert_eq!(arena[id].value, "third_mod");

        // Restore to checkpoint3
        arena.restore(checkpoint3.clone());
        assert_eq!(arena[id].value, "second_mod");

        // Restore to checkpoint2
        arena.restore(checkpoint2.clone());
        assert_eq!(arena[id].value, "first_mod");

        // Restore to checkpoint1
        arena.restore(checkpoint1.clone());
        assert_eq!(arena[id].value, "initial");

        // Test branching from checkpoint2
        arena.restore(checkpoint2);
        assert_eq!(arena[id].value, "first_mod");

        // Create alternative modification
        arena.update_with(id, |item| {
            item.value = "alt_branch".to_string();
        });

        // Verify alternative branch
        assert_eq!(arena[id].value, "alt_branch");

        // Can still restore to original checkpoints
        arena.restore(checkpoint1);
        assert_eq!(arena[id].value, "initial");
    }

    #[test]
    fn nested_checkpoints_with_multiple_items() {
        let mut arena = TransactionalArena::new();

        // Add initial items
        let id1 = arena.push_with(|id| TestItem {
            id,
            value: "first_initial".to_string(),
        });

        let id2 = arena.push_with(|id| TestItem {
            id,
            value: "second_initial".to_string(),
        });

        // First checkpoint
        let checkpoint1 = arena.checkpoint();

        // Modify both items
        arena.update_with(id1, |item| {
            item.value = "first_mod".to_string();
        });
        arena.update_with(id2, |item| {
            item.value = "second_mod".to_string();
        });

        // Second checkpoint
        let checkpoint2 = arena.checkpoint();

        // Add a new item
        let id3 = arena.push_with(|id| TestItem {
            id,
            value: "third_item".to_string(),
        });

        // Verify current state
        assert_eq!(arena[id1].value, "first_mod");
        assert_eq!(arena[id2].value, "second_mod");
        assert_eq!(arena[id3].value, "third_item");

        // Restore to checkpoint2
        arena.restore(checkpoint2);
        assert_eq!(arena[id1].value, "first_mod");
        assert_eq!(arena[id2].value, "second_mod");
        assert!(arena.get(id3).is_none());

        // Restore to checkpoint1
        arena.restore(checkpoint1);
        assert_eq!(arena[id1].value, "first_initial");
        assert_eq!(arena[id2].value, "second_initial");
        assert!(arena.get(id3).is_none());
    }
}

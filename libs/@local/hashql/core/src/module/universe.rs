use core::{
    alloc::Allocator,
    fmt::{self, Debug},
    hash::{BuildHasher, Hash},
    mem::variant_count,
    ops::{Index, IndexMut},
};

use hashbrown::{Equivalent, HashMap, HashSet, hash_map::Entry};

/// Represents the conceptual space or "universe" an item belongs to.
///
/// In HashQL, items exist in distinct conceptual spaces known as "universes".
/// This categorization helps distinguish items like type definitions from
/// runtime values or functions, even if they might share the same name.
/// Items in one universe generally do not conflict with items in another.
///
/// As an analogy, Rust also utilizes multiple universes. For instance:
/// - **Type Universe:** Contains definitions like `struct`, `enum`, `trait`.
/// - **Value Universe:** Contains concrete values (`let x = 5;`) and functions (`fn foo() {}`).
/// - **Macro Universe:** Contains procedural and declarative macros (`println!`, `vec!`).
///
/// Similarly, HashQL uses `Universe` to differentiate between its conceptual spaces.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Universe {
    /// Represents items belonging to the type universe (e.g., type definitions).
    Type,
    /// Represents items belonging to the value universe (e.g., concrete values, functions).
    Value,
}

impl Universe {
    /// Returns the name of the universe as a string slice.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Type => "Type",
            Self::Value => "Value",
        }
    }
}

const LENGTH: usize = variant_count::<Universe>();
const UNIVERSES: [Universe; LENGTH] = {
    let variants: [Universe; LENGTH] = [Universe::Type, Universe::Value];

    let mut index = 0;
    while index < LENGTH {
        let variant = variants[index];
        assert!(
            variant as usize == index,
            "Order of variants should match the enum definition"
        );
        index += 1;
    }

    variants
};

#[derive(Copy, Clone, PartialEq, Eq, Hash)]
pub struct Realms<T> {
    data: [T; LENGTH],
}

impl<T> Realms<T> {
    #[must_use]
    pub fn new() -> Self
    where
        T: Default,
    {
        Self {
            data: core::array::from_fn(|_| T::default()),
        }
    }

    #[inline]
    pub const fn of(&self, universe: Universe) -> &T {
        &self.data[universe as usize]
    }

    #[inline]
    pub const fn of_mut(&mut self, universe: Universe) -> &mut T {
        &mut self.data[universe as usize]
    }

    pub fn map<U>(&self, mut closure: impl FnMut(&T) -> U) -> Realms<U>
    where
        U: Default,
    {
        let mut result = Realms::<U>::new();

        for (universe, value) in self.realms() {
            *result.of_mut(universe) = closure(value);
        }

        result
    }

    #[inline]
    pub fn any(&self, closure: impl FnMut(&T) -> bool) -> bool {
        self.data.iter().any(closure)
    }

    #[inline]
    pub fn all(&self, closure: impl FnMut(&T) -> bool) -> bool {
        self.data.iter().all(closure)
    }

    #[inline]
    pub fn realms(&self) -> impl Iterator<Item = (Universe, &T)> {
        UNIVERSES.iter().copied().zip(self.data.iter())
    }

    #[inline]
    pub fn realms_mut(&mut self) -> impl Iterator<Item = (Universe, &mut T)> {
        UNIVERSES.iter().copied().zip(self.data.iter_mut())
    }
}

#[expect(exported_private_dependencies, reason = "equivalent is from hashbrown")]
impl<K, V, S, A> Realms<HashMap<K, V, S, A>>
where
    K: Eq + Hash,
    A: Allocator,
    S: BuildHasher,
{
    #[inline]
    pub fn insert(&mut self, universe: Universe, key: K, value: V) -> Option<V> {
        let map = self.of_mut(universe);

        map.insert(key, value)
    }

    #[inline]
    pub fn remove<Q>(&mut self, universe: Universe, key: &Q) -> Option<V>
    where
        Q: Hash + Equivalent<K> + ?Sized,
    {
        let map = self.of_mut(universe);

        map.remove(key)
    }

    #[inline]
    pub fn contains_key<Q>(&self, universe: Universe, key: &Q) -> bool
    where
        Q: Hash + Equivalent<K> + ?Sized,
    {
        let map = self.of(universe);

        map.contains_key(key)
    }

    #[inline]
    pub fn get<Q>(&self, universe: Universe, key: &Q) -> Option<&V>
    where
        Q: Hash + Equivalent<K> + ?Sized,
    {
        self.of(universe).get(key)
    }

    #[inline]
    pub fn get_mut<Q>(&mut self, universe: Universe, key: &Q) -> Option<&mut V>
    where
        Q: Hash + Equivalent<K> + ?Sized,
    {
        self.of_mut(universe).get_mut(key)
    }

    #[inline]
    pub fn entry(&mut self, universe: Universe, key: K) -> Entry<'_, K, V, S, A> {
        self.of_mut(universe).entry(key)
    }

    #[inline]
    pub fn retain(&mut self, universe: Universe, closure: impl FnMut(&K, &mut V) -> bool) {
        self.of_mut(universe).retain(closure);
    }

    #[inline]
    pub fn clear(&mut self, universe: Universe) {
        self.of_mut(universe).clear();
    }

    #[inline]
    pub fn len(&self, universe: Universe) -> usize {
        self.of(universe).len()
    }

    #[inline]
    pub fn is_empty(&self, universe: Universe) -> bool {
        self.of(universe).is_empty()
    }

    #[inline]
    pub fn capacity(&self, universe: Universe) -> usize {
        self.of(universe).capacity()
    }

    #[inline]
    pub fn reserve(&mut self, universe: Universe, additional: usize) {
        self.of_mut(universe).reserve(additional);
    }

    #[inline]
    pub fn iter(&self, universe: Universe) -> impl Iterator<Item = (&K, &V)> {
        self.of(universe).iter()
    }

    #[inline]
    pub fn iter_mut(&mut self, universe: Universe) -> impl Iterator<Item = (&K, &mut V)> {
        self.of_mut(universe).iter_mut()
    }

    #[inline]
    pub fn keys(&self, universe: Universe) -> impl Iterator<Item = &K> {
        self.of(universe).keys()
    }

    #[inline]
    pub fn values(&self, universe: Universe) -> impl Iterator<Item = &V> {
        self.of(universe).values()
    }

    #[inline]
    pub fn values_mut(&mut self, universe: Universe) -> impl Iterator<Item = &mut V> {
        self.of_mut(universe).values_mut()
    }
}

pub type RealmsMap<K, V, S, A> = Realms<HashMap<K, V, S, A>>;

#[expect(exported_private_dependencies, reason = "equivalent is from hashbrown")]
impl<K, S, A> Realms<HashSet<K, S, A>>
where
    K: Eq + Hash,
    A: Allocator,
    S: BuildHasher,
{
    #[inline]
    pub fn insert(&mut self, universe: Universe, key: K) -> bool {
        let set = self.of_mut(universe);

        set.insert(key)
    }

    #[inline]
    pub fn remove<Q>(&mut self, universe: Universe, key: &Q) -> bool
    where
        Q: Hash + Equivalent<K> + ?Sized,
    {
        let set = self.of_mut(universe);

        set.remove(key)
    }

    #[inline]
    pub fn contains<Q>(&self, universe: Universe, key: &Q) -> bool
    where
        Q: Hash + Equivalent<K> + ?Sized,
    {
        let set = self.of(universe);

        set.contains(key)
    }

    #[inline]
    pub fn clear(&mut self, universe: Universe) {
        self.of_mut(universe).clear();
    }

    #[inline]
    pub fn len(&self, universe: Universe) -> usize {
        self.of(universe).len()
    }

    #[inline]
    pub fn is_empty(&self, universe: Universe) -> bool {
        self.of(universe).is_empty()
    }

    #[inline]
    pub fn capacity(&self, universe: Universe) -> usize {
        self.of(universe).capacity()
    }

    #[inline]
    pub fn reserve(&mut self, universe: Universe, additional: usize) {
        self.of_mut(universe).reserve(additional);
    }

    #[inline]
    pub fn iter(&self, universe: Universe) -> impl Iterator<Item = &K> {
        self.of(universe).iter()
    }
}

pub type RealmsSet<K, S, A> = Realms<HashSet<K, S, A>>;

impl<T, A> Realms<Vec<T, A>>
where
    A: Allocator,
{
    #[inline]
    pub fn push(&mut self, universe: Universe, value: T) {
        let vec = self.of_mut(universe);

        vec.push(value);
    }

    #[inline]
    pub fn pop(&mut self, universe: Universe) -> Option<T> {
        self.of_mut(universe).pop()
    }

    #[inline]
    pub fn clear(&mut self, universe: Universe) {
        self.of_mut(universe).clear();
    }

    #[inline]
    pub const fn len(&self, universe: Universe) -> usize {
        self.of(universe).len()
    }

    #[inline]
    pub const fn is_empty(&self, universe: Universe) -> bool {
        self.of(universe).is_empty()
    }

    #[inline]
    pub fn extend<I>(&mut self, universe: Universe, iter: I)
    where
        I: IntoIterator<Item = T>,
    {
        self.of_mut(universe).extend(iter);
    }

    pub fn swap_remove(&mut self, universe: Universe, index: usize) -> T {
        self.of_mut(universe).swap_remove(index)
    }

    pub fn retain(&mut self, universe: Universe, closure: impl FnMut(&mut T) -> bool) {
        self.of_mut(universe).retain_mut(closure);
    }

    pub fn get(&self, universe: Universe, index: usize) -> Option<&T> {
        self.of(universe).get(index)
    }

    pub fn get_mut(&mut self, universe: Universe, index: usize) -> Option<&mut T> {
        self.of_mut(universe).get_mut(index)
    }

    #[inline]
    pub const fn capacity(&self, universe: Universe) -> usize {
        self.of(universe).capacity()
    }

    #[inline]
    pub fn reserve(&mut self, universe: Universe, additional: usize) {
        self.of_mut(universe).reserve(additional);
    }

    #[inline]
    pub fn iter(&self, universe: Universe) -> impl Iterator<Item = &T> {
        self.of(universe).iter()
    }

    #[inline]
    pub fn iter_mut(&mut self, universe: Universe) -> impl Iterator<Item = &mut T> {
        self.of_mut(universe).iter_mut()
    }
}

pub type RealmsVec<T, A> = Realms<Vec<T, A>>;

impl<T> Index<Universe> for Realms<T> {
    type Output = T;

    fn index(&self, index: Universe) -> &Self::Output {
        self.of(index)
    }
}

impl<T> IndexMut<Universe> for Realms<T> {
    fn index_mut(&mut self, index: Universe) -> &mut Self::Output {
        self.of_mut(index)
    }
}

impl<T> Debug for Realms<T>
where
    T: Debug,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut r#struct = fmt.debug_struct("Realms");

        for (universe, realm) in self.realms() {
            r#struct.field(universe.as_str(), realm);
        }

        r#struct.finish()
    }
}

impl<T> Default for Realms<T>
where
    T: Default,
{
    fn default() -> Self {
        Self::new()
    }
}

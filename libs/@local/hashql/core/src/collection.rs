use hashbrown::{HashMap, HashSet};

pub type ConcurrentHashMap<K, V> = scc::HashMap<K, V, foldhash::fast::RandomState>;
pub type ConcurrentHashSet<T> = scc::HashSet<T, foldhash::fast::RandomState>;

pub type FastHashMap<K, V> = HashMap<K, V, foldhash::fast::RandomState>;
pub type FastHashSet<T> = HashSet<T, foldhash::fast::RandomState>;

pub type TinyVec<T> = smallvec::SmallVec<T, 4>;
pub type SmallVec<T> = smallvec::SmallVec<T, 16>;

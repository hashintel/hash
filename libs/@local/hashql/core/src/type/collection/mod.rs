mod type_id_set;

use hashbrown::{HashMap, HashSet};

pub(crate) use self::type_id_set::TypeIdSet;

pub(crate) type ConcurrentHashSet<T> = scc::HashSet<T, foldhash::fast::RandomState>;

pub(crate) type FastHashMap<K, V> = HashMap<K, V, foldhash::fast::RandomState>;
pub(crate) type FastHashSet<T> = HashSet<T, foldhash::fast::RandomState>;

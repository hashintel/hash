use crate::id::{Id, bit_vec::MixedBitSet};

pub trait Recycler<T> {
    type Config;

    fn recycle(&mut self, item: &mut T);
    fn acquire(&mut self, config: Self::Config) -> T;
    fn prepare(&mut self, item: &mut T, config: Self::Config);
}

#[derive(Debug)]
pub struct Pool<T, R> {
    free: Vec<T>,
    recycler: R,
    capacity: usize,
}

impl<T, R> Pool<T, R> {
    #[must_use]
    pub fn new(capacity: usize) -> Self
    where
        R: Default,
    {
        Self::with_recycler(capacity, R::default())
    }

    pub fn with_recycler(capacity: usize, recycler: R) -> Self {
        Self {
            free: Vec::with_capacity(capacity),
            recycler,
            capacity,
        }
    }
}

impl<T, R> Pool<T, R>
where
    R: Recycler<T>,
{
    pub fn resize(&mut self, new_max_size: usize) {
        self.capacity = new_max_size;
        if self.free.len() > new_max_size {
            self.free.truncate(new_max_size);
        }

        if self.free.capacity() < new_max_size {
            self.free.reserve(new_max_size - self.free.capacity());
        }
    }

    pub const fn capacity(&self) -> usize {
        self.capacity
    }

    pub fn acquire_with(&mut self, config: R::Config) -> T {
        let Some(mut item) = self.free.pop() else {
            return self.recycler.acquire(config);
        };

        self.recycler.prepare(&mut item, config);
        item
    }

    pub fn acquire(&mut self) -> T
    where
        R: Recycler<T, Config = ()>,
    {
        self.acquire_with(())
    }

    pub fn release(&mut self, mut item: T) {
        if self.free.len() >= self.capacity {
            return;
        }

        self.recycler.recycle(&mut item);
        self.free.push(item);
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub struct VecRecycler;

impl<T> Recycler<Vec<T>> for VecRecycler {
    type Config = usize;

    fn recycle(&mut self, item: &mut Vec<T>) {
        item.clear();
    }

    fn acquire(&mut self, config: Self::Config) -> Vec<T> {
        Vec::with_capacity(config)
    }

    fn prepare(&mut self, item: &mut Vec<T>, config: Self::Config) {
        // Only *grow* the vector if it's smaller than the requested capacity
        if item.capacity() < config {
            item.reserve(config - item.capacity());
        }
    }
}

pub type VecPool<T> = Pool<Vec<T>, VecRecycler>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub struct MixedBitSetRecycler {
    pub domain_size: usize,
}

impl<I> Recycler<MixedBitSet<I>> for MixedBitSetRecycler
where
    I: Id,
{
    type Config = ();

    fn recycle(&mut self, item: &mut MixedBitSet<I>) {
        item.clear();
    }

    fn acquire(&mut self, (): ()) -> MixedBitSet<I> {
        MixedBitSet::new_empty(self.domain_size)
    }

    // We do not need to change anything when preparing, because the domain size is constant
    fn prepare(&mut self, _: &mut MixedBitSet<I>, (): ()) {}
}

pub type MixedBitSetPool<I> = Pool<MixedBitSet<I>, MixedBitSetRecycler>;

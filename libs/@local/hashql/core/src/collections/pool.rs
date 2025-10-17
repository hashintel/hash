pub trait Recycler<T> {
    type Config;

    fn recycle(&mut self, item: &mut T);
    fn acquire(&mut self, config: Self::Config) -> T;
    fn prepare(&mut self, item: &mut T, config: Self::Config);
}

pub struct Pool<T, R> {
    free: Vec<T>,
    recycler: R,
    max_size: usize,
}

impl<T, R> Pool<T, R>
where
    R: Recycler<T>,
{
    pub fn new(recycler: R, max_size: usize) -> Self {
        Self {
            free: Vec::with_capacity(max_size),
            recycler,
            max_size,
        }
    }

    pub fn resize(&mut self, new_max_size: usize) {
        self.max_size = new_max_size;
        if self.free.len() > new_max_size {
            self.free.truncate(new_max_size);
        }

        if self.free.capacity() < new_max_size {
            self.free.reserve(new_max_size - self.free.capacity());
        }
    }

    pub fn acquire(&mut self, config: R::Config) -> T {
        let Some(mut item) = self.free.pop() else {
            return self.recycler.acquire(config);
        };

        self.recycler.prepare(&mut item, config);
        item
    }

    pub fn release(&mut self, mut item: T) {
        if self.free.len() >= self.max_size {
            return;
        }

        self.recycler.recycle(&mut item);
        self.free.push(item);
    }
}

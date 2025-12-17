use core::alloc::Allocator;

pub trait FromIteratorIn<T, A: Allocator> {
    fn from_iter_in<I>(iter: I, alloc: A) -> Self
    where
        I: IntoIterator<Item = T>;
}

impl<T, A: Allocator> FromIteratorIn<T, A> for Vec<T, A> {
    fn from_iter_in<I>(iter: I, alloc: A) -> Self
    where
        I: IntoIterator<Item = T>,
    {
        let mut vec = Self::new_in(alloc);
        vec.extend(iter);
        vec
    }
}

pub trait CollectIn<C, A: Allocator> {
    fn collect_in(self, alloc: A) -> C;
}

impl<I, C: FromIteratorIn<T, A>, T, A: Allocator> CollectIn<C, A> for I
where
    I: IntoIterator<Item = T>,
{
    fn collect_in(self, alloc: A) -> C {
        C::from_iter_in(self, alloc)
    }
}

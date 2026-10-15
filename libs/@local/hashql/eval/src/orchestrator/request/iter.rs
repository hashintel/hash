use core::iter;

/// Adapter that adds [`ExactSizeIterator`] semantics to an iterator with known length.
pub(crate) struct ExactSizeAdapter<I> {
    iter: I,
    len: usize,
}

impl ExactSizeAdapter<!> {
    pub(crate) fn from_chain<T, I, J>(first: I, second: J) -> ExactSizeAdapter<iter::Chain<I, J>>
    where
        I: ExactSizeIterator<Item = T>,
        J: ExactSizeIterator<Item = T>,
    {
        let len = first.len() + second.len();

        ExactSizeAdapter {
            iter: first.chain(second),
            len,
        }
    }
}

impl<I> Iterator for ExactSizeAdapter<I>
where
    I: Iterator,
{
    type Item = I::Item;

    fn next(&mut self) -> Option<Self::Item> {
        let item = self.iter.next()?;
        self.len -= 1;

        Some(item)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        (self.len, Some(self.len))
    }
}

impl<I> DoubleEndedIterator for ExactSizeAdapter<I>
where
    I: DoubleEndedIterator,
{
    fn next_back(&mut self) -> Option<Self::Item> {
        let item = self.iter.next_back()?;
        self.len -= 1;

        Some(item)
    }
}

impl<I> ExactSizeIterator for ExactSizeAdapter<I>
where
    I: Iterator,
{
    fn len(&self) -> usize {
        self.len
    }
}

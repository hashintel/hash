use std::error::Error;

use crate::Report;

#[cfg(feature = "std")]
impl<E> From<E> for Report<E>
where
    E: Error + Send + Sync + 'static,
{
    #[track_caller]
    #[inline]
    fn from(error: E) -> Self {
        Self::from_error(error)
    }
}

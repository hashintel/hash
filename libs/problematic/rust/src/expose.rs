use alloc::boxed::Box;
use core::marker::PhantomData;

use http::HeaderMap;

use crate::{
    Problem, ProblemDetails, ProblemVariant,
    problem::{Occurrence, contains},
};

/// A failure that answers with a variant of `K`.
///
/// [`expose`](Self::expose) returns `None` for a failure that stays internal. A failure
/// implements it once for every problem set it can be answered with.
pub trait Expose<K: Problem> {
    fn expose(&self) -> Option<Answer<'_, K>>;
}

/// An occurrence of a variant of `K`.
pub struct Answer<'s, K> {
    occurrence: Box<dyn Occurrence + 's>,
    problem: PhantomData<fn() -> K>,
}

impl<'s, K: Problem> Answer<'s, K> {
    /// Answers with `variant`.
    ///
    /// # Panics
    ///
    /// Fails at compile time if `K::VARIANTS` lists no variant with the type URI and status of
    /// `V`.
    #[must_use]
    pub fn new<V: ProblemVariant + 's>(variant: V) -> Self {
        const {
            assert!(
                contains(K::VARIANTS, &V::TYPE),
                "`K::VARIANTS` should list the variant"
            );
        };

        Self {
            occurrence: Box::new(variant),
            problem: PhantomData,
        }
    }
}

impl<K> Answer<'_, K> {
    /// The problem details this occurrence is answered with.
    #[must_use]
    pub fn details(&self) -> ProblemDetails<'_, &dyn erased_serde::Serialize> {
        self.occurrence.details()
    }

    /// Adds the response headers of this occurrence.
    pub fn headers(&self, headers: &mut HeaderMap) {
        self.occurrence.headers(headers);
    }
}

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
    /// `V`:
    ///
    /// ```compile_fail,E0080
    /// # use std::{borrow::Cow, fmt};
    /// use problematic::{Answer, Problem, ProblemType, ProblemVariant, StatusCode, Variant};
    ///
    /// #[derive(serde::Serialize, schemars::JsonSchema)]
    /// struct WebNotFound;
    /// # impl fmt::Display for WebNotFound {
    /// #     fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    /// #         formatter.write_str("The web does not exist.")
    /// #     }
    /// # }
    ///
    /// impl ProblemVariant for WebNotFound {
    ///     const TYPE: ProblemType = ProblemType {
    ///         type_uri: Cow::Borrowed("/problems/web/not-found"),
    ///         title: Cow::Borrowed("Web not found"),
    ///         status: StatusCode::NOT_FOUND,
    ///     };
    /// }
    ///
    /// #[derive(serde::Serialize, schemars::JsonSchema)]
    /// struct EntityNotFound;
    /// # impl fmt::Display for EntityNotFound {
    /// #     fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    /// #         formatter.write_str("The entity does not exist.")
    /// #     }
    /// # }
    ///
    /// impl ProblemVariant for EntityNotFound {
    ///     const TYPE: ProblemType = ProblemType {
    ///         type_uri: Cow::Borrowed("/problems/entity/not-found"),
    ///         title: Cow::Borrowed("Entity not found"),
    ///         status: StatusCode::NOT_FOUND,
    ///     };
    /// }
    ///
    /// struct ArchiveWeb;
    ///
    /// impl Problem for ArchiveWeb {
    ///     const VARIANTS: &'static [Variant] = &[Variant::of::<WebNotFound>()];
    /// }
    ///
    /// let answer = Answer::<ArchiveWeb>::new(EntityNotFound);
    /// ```
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

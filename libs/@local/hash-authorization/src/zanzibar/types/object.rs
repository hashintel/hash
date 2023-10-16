use std::error::Error;

use serde::Serialize;

pub trait Object: Sized + Send + Sync {
    type Namespace: Serialize;
    type Id: Serialize;

    /// Creates an object from a namespace and an id.
    ///
    /// # Errors
    ///
    /// Returns an error if the namespace and id are not valid for the object.
    fn new(namespace: Self::Namespace, id: Self::Id) -> Result<Self, impl Error>;

    fn namespace(&self) -> &Self::Namespace;

    fn id(&self) -> &Self::Id;
}

#[derive(Debug, PartialEq, Eq)]
pub struct ObjectFilter<'a, N, I> {
    pub namespace: &'a N,
    pub id: Option<&'a I>,
}

impl<N, I> Copy for ObjectFilter<'_, N, I> {}
impl<N, I> Clone for ObjectFilter<'_, N, I> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<'a, O> From<&'a O> for ObjectFilter<'a, O::Namespace, O::Id>
where
    O: Object,
{
    fn from(object: &'a O) -> Self {
        Self {
            namespace: object.namespace(),
            id: Some(object.id()),
        }
    }
}

impl<'a> ObjectFilter<'a, !, !> {
    #[must_use]
    pub const fn from_namespace<N>(namespace: &'a N) -> ObjectFilter<'a, N, !> {
        ObjectFilter {
            namespace,
            id: None,
        }
    }
}

impl<'a, N> ObjectFilter<'a, N, !> {
    #[must_use]
    pub const fn with_id<I>(self, id: &'a I) -> ObjectFilter<'a, N, I> {
        ObjectFilter {
            namespace: self.namespace,
            id: Some(id),
        }
    }
}

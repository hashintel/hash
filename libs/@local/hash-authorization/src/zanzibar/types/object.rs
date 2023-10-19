use std::error::Error;

pub trait Object: Sized {
    type Namespace;
    type Id;

    /// Creates an object from a namespace and an id.
    ///
    /// # Errors
    ///
    /// Returns an error if the namespace and id are not valid for the object.
    fn from_parts(namespace: Self::Namespace, id: Self::Id) -> Result<Self, impl Error>;

    fn to_parts(&self) -> (Self::Namespace, Self::Id);

    fn into_parts(self) -> (Self::Namespace, Self::Id);
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ObjectFilter<N, I> {
    pub namespace: N,
    pub id: Option<I>,
}

impl<O> From<O> for ObjectFilter<O::Namespace, O::Id>
where
    O: Object,
{
    fn from(object: O) -> Self {
        let (namespace, id) = object.into_parts();
        Self {
            namespace,
            id: Some(id),
        }
    }
}

impl ObjectFilter<!, !> {
    #[must_use]
    pub const fn from_namespace<N>(namespace: N) -> ObjectFilter<N, !> {
        ObjectFilter {
            namespace,
            id: None,
        }
    }
}

impl<N> ObjectFilter<N, !> {
    #[must_use]
    pub fn with_id<I>(self, id: I) -> ObjectFilter<N, I> {
        ObjectFilter {
            namespace: self.namespace,
            id: Some(id),
        }
    }
}

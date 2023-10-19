use std::error::Error;

pub trait Resource: Sized {
    type Namespace;
    type Id;

    /// Creates a resource from a namespace and an id.
    ///
    /// # Errors
    ///
    /// Returns an error if the namespace and id are not valid for the resource.
    fn from_parts(namespace: Self::Namespace, id: Self::Id) -> Result<Self, impl Error>;

    fn to_parts(&self) -> (Self::Namespace, Self::Id);

    fn into_parts(self) -> (Self::Namespace, Self::Id);
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ResourceFilter<N, I> {
    pub namespace: N,
    pub id: Option<I>,
}

impl<O> From<O> for ResourceFilter<O::Namespace, O::Id>
where
    O: Resource,
{
    fn from(resource: O) -> Self {
        let (namespace, id) = resource.into_parts();
        Self {
            namespace,
            id: Some(id),
        }
    }
}

impl ResourceFilter<!, !> {
    #[must_use]
    pub const fn from_namespace<N>(namespace: N) -> ResourceFilter<N, !> {
        ResourceFilter {
            namespace,
            id: None,
        }
    }
}

impl<N> ResourceFilter<N, !> {
    #[must_use]
    pub fn with_id<I>(self, id: I) -> ResourceFilter<N, I> {
        ResourceFilter {
            namespace: self.namespace,
            id: Some(id),
        }
    }
}

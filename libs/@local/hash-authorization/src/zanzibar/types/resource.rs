use std::error::Error;

pub trait Resource: Sized {
    type Kind;
    type Id;

    /// Creates a resource from a kind and an id.
    ///
    /// # Errors
    ///
    /// Returns an error if the kind and id are not valid for the resource.
    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error>;

    fn to_parts(&self) -> (Self::Kind, Self::Id);

    fn into_parts(self) -> (Self::Kind, Self::Id);
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ResourceFilter<N, I> {
    pub kind: N,
    pub id: Option<I>,
}

impl<O> From<O> for ResourceFilter<O::Kind, O::Id>
where
    O: Resource,
{
    fn from(resource: O) -> Self {
        let (kind, id) = resource.into_parts();
        Self { kind, id: Some(id) }
    }
}

impl ResourceFilter<!, !> {
    #[must_use]
    pub const fn from_kind<N>(kind: N) -> ResourceFilter<N, !> {
        ResourceFilter { kind, id: None }
    }
}

impl<N> ResourceFilter<N, !> {
    #[must_use]
    pub fn with_id<I>(self, id: I) -> ResourceFilter<N, I> {
        ResourceFilter {
            kind: self.kind,
            id: Some(id),
        }
    }
}

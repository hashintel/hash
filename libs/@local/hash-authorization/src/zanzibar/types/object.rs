use std::error::Error;

pub trait Object: Sized + Send + Sync {
    type Namespace;
    type Id;

    fn new(namespace: Self::Namespace, id: Self::Id) -> Result<Self, impl Error>;

    fn namespace(&self) -> &Self::Namespace;

    fn id(&self) -> &Self::Id;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ObjectFilter<'a, N, I> {
    pub namespace: &'a N,
    pub id: Option<&'a I>,
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

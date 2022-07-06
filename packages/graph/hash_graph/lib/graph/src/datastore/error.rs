use std::{any::type_name, fmt, marker::PhantomData};

use error_stack::{provider::Demand, Context};

use crate::types::BaseId;

#[derive(Debug)]
#[must_use]
pub struct InsertionError<T>(T);

impl<T> InsertionError<T> {
    pub const fn new(t: T) -> Self {
        Self(t)
    }
}

impl<T> fmt::Display for InsertionError<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "Could not insert `{}` into database", type_name::<T>())
    }
}

impl<T: fmt::Debug + Send + Sync + 'static> Context for InsertionError<T> {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        demand.provide_ref(&self.0);
    }
}

// TODO: Remove `Q` generic by adding a trait to `T`
#[must_use]
pub struct QueryError<Q, T>(Q, PhantomData<T>);

impl<Q, T> QueryError<Q, T> {
    pub const fn new(query: Q) -> Self {
        Self(query, PhantomData)
    }
}

impl<Q: fmt::Debug, T> fmt::Debug for QueryError<Q, T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

// SAFETY: `Q` is `Send` and `T` is inside of `PhantomData
unsafe impl<Q: Send, T> Send for QueryError<Q, T> {}
// SAFETY: `Q` is `Sync` and `T` is inside of `PhantomData
unsafe impl<Q: Sync, T> Sync for QueryError<Q, T> {}

impl<Q: fmt::Display, T> fmt::Display for QueryError<Q, T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "Could not query `{}` with id {}",
            type_name::<T>(),
            self.0
        )
    }
}

impl<Q: fmt::Debug + fmt::Display + Send + Sync + 'static, T: 'static> Context
    for QueryError<Q, T>
{
}

#[derive(Debug)]
#[must_use]
pub struct UpdateError<T>(T);

impl<T> UpdateError<T> {
    pub const fn new(t: T) -> Self {
        Self(t)
    }
}

impl<T> fmt::Display for UpdateError<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "Could not update `{}`", type_name::<T>())
    }
}

impl<T: fmt::Debug + Send + Sync + 'static> Context for UpdateError<T> {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        demand.provide_ref(&self.0);
    }
}

#[derive(Debug)]
#[must_use]
pub struct AlreadyExists {
    pub base_id: BaseId,
}

impl AlreadyExists {
    pub const fn new(base_id: BaseId) -> Self {
        Self { base_id }
    }
}

impl fmt::Display for AlreadyExists {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "Base id `{}` already exists", self.base_id)
    }
}

impl Context for AlreadyExists {}

#[derive(Debug)]
#[must_use]
pub struct DoesNotExist {
    pub base_id: BaseId,
}

impl DoesNotExist {
    pub const fn new(base_id: BaseId) -> Self {
        Self { base_id }
    }
}

impl fmt::Display for DoesNotExist {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "Base id `{}` already exists", self.base_id)
    }
}

impl Context for DoesNotExist {}

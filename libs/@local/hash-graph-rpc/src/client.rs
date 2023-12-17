use std::marker::PhantomData;

use crate::rpc::{ProcedureSpecification, ServiceSpecification};

pub trait Includes<T> {}

pub struct Client<T> {
    _service: PhantomData<T>,
}

impl<T> Client<T>
where
    T: ServiceSpecification,
{
    pub fn new() -> Self {
        Self {
            _service: PhantomData,
        }
    }

    pub async fn call<P>(&self, request: P::Request) -> P::Response
    where
        P: ProcedureSpecification,
        T::Procedures: Includes<P>,
    {
        todo!()
    }
}

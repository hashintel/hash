use std::marker::PhantomData;

use erased_serde::{Serialize, Serializer};

use crate::frame::Frame;

macro_rules! all_the_tuples {
    ($name:ident) => {
        $name!(T1);
        $name!(T1, T2);
        $name!(T1, T2, T3);
        $name!(T1, T2, T3, T4);
        $name!(T1, T2, T3, T4, T5);
        $name!(T1, T2, T3, T4, T5, T6);
        $name!(T1, T2, T3, T4, T5, T6, T7);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8, T9);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8, T9, T10);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14);
        $name!(
            T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15
        );
        $name!(
            T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16
        );
    };
}

type UInt0 = ();
type UInt1 = ((), UInt0);
type UInt2 = ((), UInt1);

trait UInt {}

impl UInt for () {}
impl<T: UInt> UInt for ((), T) {}

pub trait Hook<T, U> {
    fn call(&self, frame: &T, s: &mut dyn Serializer) -> Option<erased_serde::Result<()>>;
}

// TODO: tuple types (how to do second argument?)
impl<F, T> Hook<T, UInt0> for F
where
    F: Fn(&T, &mut dyn Serializer) -> erased_serde::Result<()>,
    T: Send + Sync + 'static,
{
    fn call(&self, frame: &T, s: &mut dyn Serializer) -> Option<erased_serde::Result<()>> {
        Some((self)(frame, s))
    }
}

impl<F, T, U> Hook<T, UInt1> for F
where
    F: Fn(&T) -> U,
    T: Send + Sync + 'static,
    U: serde::Serialize,
{
    fn call(&self, frame: &T, s: &mut dyn Serializer) -> Option<erased_serde::Result<()>> {
        let res = (self)(frame);
        Some(res.erased_serialize(s).map(|_| ()))
    }
}

struct Phantom<T> {
    _marker: PhantomData<T>,
}

macro_rules! impl_hook_tuple {
    () => {};

    ( $($ty:ident),* $(,)? ) => {
        #[allow(non_snake_case)]
        #[automatically_derived]
        impl<$($ty,)*> Hook<Frame, ($($ty,)*)> for Phantom<($($ty,)*)>
        where
            $($ty: serde::Serialize + Send + Sync + 'static),*
        {
            fn call(&self, frame: &Frame, s: &mut dyn Serializer) -> Option<erased_serde::Result<()>> {
                $(
                    if let Some($ty) = frame.downcast_ref::<$ty>() {
                        return Some($ty.erased_serialize(s).map(|_| ()))
                    }
                )*

                None
            }
        }
    }
}

all_the_tuples!(impl_hook_tuple);

struct Stack<L, T, R> {
    left: L,
    right: R,
    _marker: PhantomData<T>,
}

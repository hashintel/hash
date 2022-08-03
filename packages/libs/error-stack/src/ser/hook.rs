use std::marker::PhantomData;

use erased_serde::{Error, Serialize, Serializer};
use serde::Serialize as _;

use crate::{frame::Frame, ser::hook};

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
    fn call(&self, frame: &T) -> Option<Box<dyn Serialize>>;
}

impl<F, T, U> Hook<T, UInt1> for F
where
    F: Fn(&T) -> U,
    T: Send + Sync + 'static,
    U: serde::Serialize,
{
    fn call(&self, frame: &T) -> Option<Box<dyn Serialize>> {
        Some(Box::new((self)(frame)))
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
            fn call(&self, frame: &Frame) -> Option<Box<dyn Serialize>> {
                $(
                    if let Some($ty) = frame.downcast_ref::<$ty>() {
                        return Some(Box::new($ty))
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

impl<L, T, U, R> Hook<Frame, UInt0> for Stack<L, (T, U), R>
where
    L: Hook<T, U>,
    T: Sync + Send + 'static,
    R: Hook<Frame, UInt0>,
{
    fn call(&self, frame: &Frame) -> Option<Box<dyn Serialize>> {
        frame
            .downcast_ref()
            .and_then(|value| self.left.call(value))
            .or_else(|| self.right.call(frame))
    }
}

struct Combine<L, R> {
    left: L,
    right: R,
}

impl<L, R> Hook<Frame, UInt0> for Combine<L, R>
where
    L: Hook<Frame, UInt0>,
    R: Hook<Frame, UInt0>,
{
    fn call(&self, frame: &Frame) -> Option<Box<dyn Serialize>> {
        self.left.call(frame).or_else(|| self.right.call(frame))
    }
}

impl Hook<Frame, UInt0> for Box<dyn Hook<Frame, UInt0>> {
    fn call(&self, frame: &Frame) -> Option<Box<dyn Serialize>> {
        let hook: &dyn Hook<Frame, UInt0> = self;
        hook.call(frame)
    }
}

impl Hook<Frame, UInt0> for () {
    fn call(&self, _: &Frame) -> Option<Box<dyn Serialize>> {
        None
    }
}

pub struct Hooks<T: Hook<Frame, UInt0>>(T);

impl<T: Hook<Frame, UInt0>> Hooks<T> {
    pub(crate) fn call(&self, frame: &Frame) -> Option<Box<dyn Serialize>> {
        self.0.call(frame)
    }
}

pub(crate) type ErasedHooks = Hooks<Box<dyn Hook<Frame, UInt0>>>;

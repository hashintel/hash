use std::{
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Buf;
use error_stack::Report;

use crate::body::{Body, BodyState, Frame};

macro_rules! forward {
    (   $(#[$meta:meta])*
        fn $name:ident(&self $(, $argument:ident : $type:ty)*) -> $return:ty; $($rest:tt)*
    ) => {
        $(#[$meta])*
        fn $name(&self $(, $argument : $type)*) -> $return {
            match self {
                Self::Left(left) => left.$name($($argument),*),
                Self::Right(right) => right.$name($($argument),*),
            }
        }

        forward!($($rest)*);
    };

    (   $(#[$meta:meta])*
        fn $name:ident(&mut self $(, $argument:ident : $type:ty)*) -> $return:ty; $($rest:tt)*
    ) => {
        $(#[$meta])*
        fn $name(&mut self $(, $argument : $type)*) -> $return {
            match self {
                Self::Left(left) => left.$name($($argument),*),
                Self::Right(right) => right.$name($($argument),*),
            }
        }

        forward!($($rest)*);
    };

    () => {};
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum EitherError {
    #[error("left side has experienced an error")]
    Left,
    #[error("right side has experienced an error")]
    Right,
}

#[pin_project::pin_project(project = EitherProj)]
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Either<L, R> {
    Left(#[pin] L),
    Right(#[pin] R),
}

impl<L, R> Either<L, R> {
    pub fn left(&self) -> Option<&L> {
        match self {
            Self::Left(left) => Some(left),
            Self::Right(_) => None,
        }
    }

    pub fn left_mut(&mut self) -> Option<&mut L> {
        match self {
            Self::Left(left) => Some(left),
            Self::Right(_) => None,
        }
    }

    pub fn into_left(self) -> Option<L> {
        match self {
            Self::Left(left) => Some(left),
            Self::Right(_) => None,
        }
    }

    pub fn right(&self) -> Option<&R> {
        match self {
            Self::Left(_) => None,
            Self::Right(right) => Some(right),
        }
    }

    pub fn right_mut(&mut self) -> Option<&mut R> {
        match self {
            Self::Left(_) => None,
            Self::Right(right) => Some(right),
        }
    }

    pub fn into_right(self) -> Option<R> {
        match self {
            Self::Left(_) => None,
            Self::Right(right) => Some(right),
        }
    }
}

impl<L, R, T> AsRef<T> for Either<L, R>
where
    L: AsRef<T>,
    R: AsRef<T>,
{
    forward!(
        fn as_ref(&self) -> &T;
    );
}

impl<T> Either<T, T> {
    pub fn into_inner(self) -> T {
        match self {
            Self::Left(left) => left,
            Self::Right(right) => right,
        }
    }
}

impl<L, R> Buf for Either<L, R>
where
    L: Buf,
    R: Buf,
{
    forward!(
        fn get_u8(&mut self) -> u8;
        fn get_i8(&mut self) -> i8;

        fn get_u16(&mut self) -> u16;
        fn get_u16_le(&mut self) -> u16;
        fn get_u16_ne(&mut self) -> u16;

        fn get_i16(&mut self) -> i16;
        fn get_i16_le(&mut self) -> i16;
        fn get_i16_ne(&mut self) -> i16;

        fn get_u32(&mut self) -> u32;
        fn get_u32_le(&mut self) -> u32;
        fn get_u32_ne(&mut self) -> u32;

        fn get_i32(&mut self) -> i32;
        fn get_i32_le(&mut self) -> i32;
        fn get_i32_ne(&mut self) -> i32;

        fn get_u64(&mut self) -> u64;
        fn get_u64_le(&mut self) -> u64;
        fn get_u64_ne(&mut self) -> u64;

        fn get_i64(&mut self) -> i64;
        fn get_i64_le(&mut self) -> i64;
        fn get_i64_ne(&mut self) -> i64;

        fn get_u128(&mut self) -> u128;
        fn get_u128_le(&mut self) -> u128;
        fn get_u128_ne(&mut self) -> u128;

        fn get_i128(&mut self) -> i128;
        fn get_i128_le(&mut self) -> i128;
        fn get_i128_ne(&mut self) -> i128;

        fn get_f32(&mut self) -> f32;
        fn get_f32_le(&mut self) -> f32;
        fn get_f32_ne(&mut self) -> f32;

        fn get_f64(&mut self) -> f64;
        fn get_f64_le(&mut self) -> f64;
        fn get_f64_ne(&mut self) -> f64;

        fn get_uint(&mut self, nbytes: usize) -> u64;
        fn get_uint_le(&mut self, nbytes: usize) -> u64;
        fn get_uint_ne(&mut self, nbytes: usize) -> u64;

        fn get_int(&mut self, nbytes: usize) -> i64;
        fn get_int_le(&mut self, nbytes: usize) -> i64;
        fn get_int_ne(&mut self, nbytes: usize) -> i64;

        fn remaining(&self) -> usize;
        fn chunk(&self) -> &[u8];
        fn advance(&mut self, cnt: usize) -> ();
        fn has_remaining(&self) -> bool;
        fn copy_to_slice(&mut self, dst: &mut [u8]) -> ();
        fn copy_to_bytes(&mut self, len: usize) -> bytes::Bytes;
    );

    fn chunks_vectored<'a>(&'a self, dst: &mut [std::io::IoSlice<'a>]) -> usize {
        match self {
            Self::Left(left) => left.chunks_vectored(dst),
            Self::Right(right) => right.chunks_vectored(dst),
        }
    }
}

impl<L, R, C1, C2> Body for Either<L, R>
where
    L: Body<Error = Report<C1>>,
    R: Body<Error = Report<C2>>,
{
    type Control = Either<L::Control, R::Control>;
    type Data = Either<L::Data, R::Data>;
    type Error = Report<EitherError>;

    forward!(
        fn state(&self) -> Option<BodyState>;
    );

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>> {
        let this = self.project();

        match this {
            EitherProj::Left(left) => left
                .poll_frame(cx)
                .map_ok(|frame| frame.map_data(Either::Left).map_control(Either::Left))
                .map_err(|error| error.change_context(EitherError::Left)),

            EitherProj::Right(right) => right
                .poll_frame(cx)
                .map_ok(|frame| frame.map_data(Either::Right).map_control(Either::Right))
                .map_err(|error| error.change_context(EitherError::Right)),
        }
    }
}

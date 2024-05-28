use std::{
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Buf;
use error_stack::Report;

use super::{Body, Frame};

macro_rules! get {
    ($ty:ty => $($method:ident),*) => {
        $(
            fn $method(&mut self) -> $ty {
                match self {
                    Self::Left(left) => left.$method(),
                    Self::Right(right) => right.$method(),
                }
            }
        )*
    };
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
    fn as_ref(&self) -> &T {
        match self {
            Self::Left(left) => left.as_ref(),
            Self::Right(right) => right.as_ref(),
        }
    }
}

impl<T> Either<T, T> {
    pub fn into_inner(self) -> T {
        match self {
            Self::Left(left) => left,
            Self::Right(right) => right,
        }
    }
}

// TODO: don't particularly like the names here.
impl<L> Either<L, !> {
    pub fn take_left(self) -> L {
        let Self::Left(left) = self;

        left
    }
}

impl<R> Either<!, R> {
    pub fn take_right(self) -> R {
        let Self::Right(right) = self;

        right
    }
}

impl<L, R> Buf for Either<L, R>
where
    L: Buf,
    R: Buf,
{
    get!(u8 => get_u8);

    get!(i8 => get_i8);

    get!(u16 => get_u16, get_u16_le, get_u16_ne);

    get!(i16 => get_i16, get_i16_le, get_i16_ne);

    get!(u32 => get_u32, get_u32_le, get_u32_ne);

    get!(i32 => get_i32, get_i32_le, get_i32_ne);

    get!(u64 => get_u64, get_u64_le, get_u64_ne);

    get!(i64 => get_i64, get_i64_le, get_i64_ne);

    get!(u128 => get_u128, get_u128_le, get_u128_ne);

    get!(i128 => get_i128, get_i128_le, get_i128_ne);

    get!(f32 => get_f32, get_f32_le, get_f32_ne);

    get!(f64 => get_f64, get_f64_le, get_f64_ne);

    fn remaining(&self) -> usize {
        match self {
            Self::Left(left) => left.remaining(),
            Self::Right(right) => right.remaining(),
        }
    }

    fn chunk(&self) -> &[u8] {
        match self {
            Self::Left(left) => left.chunk(),
            Self::Right(right) => right.chunk(),
        }
    }

    fn advance(&mut self, cnt: usize) {
        match self {
            Self::Left(left) => left.advance(cnt),
            Self::Right(right) => right.advance(cnt),
        }
    }

    fn chunks_vectored<'a>(&'a self, dst: &mut [std::io::IoSlice<'a>]) -> usize {
        match self {
            Self::Left(left) => left.chunks_vectored(dst),
            Self::Right(right) => right.chunks_vectored(dst),
        }
    }

    fn has_remaining(&self) -> bool {
        match self {
            Self::Left(left) => left.has_remaining(),
            Self::Right(right) => right.has_remaining(),
        }
    }

    fn copy_to_slice(&mut self, dst: &mut [u8]) {
        match self {
            Self::Left(left) => left.copy_to_slice(dst),
            Self::Right(right) => right.copy_to_slice(dst),
        }
    }

    fn get_uint(&mut self, nbytes: usize) -> u64 {
        match self {
            Self::Left(left) => left.get_uint(nbytes),
            Self::Right(right) => right.get_uint(nbytes),
        }
    }

    fn get_uint_le(&mut self, nbytes: usize) -> u64 {
        match self {
            Self::Left(left) => left.get_uint_le(nbytes),
            Self::Right(right) => right.get_uint_le(nbytes),
        }
    }

    fn get_uint_ne(&mut self, nbytes: usize) -> u64 {
        match self {
            Self::Left(left) => left.get_uint_ne(nbytes),
            Self::Right(right) => right.get_uint_ne(nbytes),
        }
    }

    fn get_int(&mut self, nbytes: usize) -> i64 {
        match self {
            Self::Left(left) => left.get_int(nbytes),
            Self::Right(right) => right.get_int(nbytes),
        }
    }

    fn get_int_le(&mut self, nbytes: usize) -> i64 {
        match self {
            Self::Left(left) => left.get_int_le(nbytes),
            Self::Right(right) => right.get_int_le(nbytes),
        }
    }

    fn get_int_ne(&mut self, nbytes: usize) -> i64 {
        match self {
            Self::Left(left) => left.get_int_ne(nbytes),
            Self::Right(right) => right.get_int_ne(nbytes),
        }
    }

    fn copy_to_bytes(&mut self, len: usize) -> bytes::Bytes {
        match self {
            Self::Left(left) => left.copy_to_bytes(len),
            Self::Right(right) => right.copy_to_bytes(len),
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

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>> {
        let this = self.project();

        match this {
            EitherProj::Left(left) => left.poll_frame(cx).map(|opt| {
                opt.map(|response| {
                    response
                        .map(|frame| frame.map_data(Either::Left).map_control(Either::Left))
                        .map_err(|error| error.change_context(EitherError::Left))
                })
            }),

            EitherProj::Right(right) => right.poll_frame(cx).map(|response| {
                response.map(|response| {
                    response
                        .map(|frame| frame.map_data(Either::Right).map_control(Either::Right))
                        .map_err(|error| error.change_context(EitherError::Right))
                })
            }),
        }
    }

    fn is_complete(&self) -> Option<bool> {
        match self {
            Self::Left(left) => left.is_complete(),
            Self::Right(right) => right.is_complete(),
        }
    }
}

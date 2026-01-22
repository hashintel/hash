macro_rules! forward_ref_unop {
    (
        $(#[$attr:meta])*
        impl $trait:ident::$method:ident for $type:ty
    ) => {
        $(#[$attr])*
        impl $trait for &$type {
            type Output = <$type as $trait>::Output;

            #[inline]
            fn $method(self) -> <$type as $trait>::Output {
                $trait::$method(*self)
            }
        }
    }
}

macro_rules! forward_ref_binop {
    (
        $(#[$attr:meta])*
        impl $trait:ident<$other:ty>::$method:ident for $type:ty
    ) => {
        $(#[$attr])*
        impl $trait<$other> for &$type {
            type Output = <$type as $trait<$other>>::Output;

            #[inline]
            #[track_caller]
            fn $method(self, other: $other) -> <$type as $trait<$other>>::Output {
                $trait::$method(*self, other)
            }
        }

        $(#[$attr])*
        impl $trait<&$other> for $type {
            type Output = <$type as $trait<$other>>::Output;

            #[inline]
            #[track_caller]
            fn $method(self, other: &$other) -> <$type as $trait<$other>>::Output {
                $trait::$method(self, *other)
            }
        }

        $(#[$attr])*
        impl $trait<&$other> for &$type {
            type Output = <$type as $trait<$other>>::Output;

            #[inline]
            #[track_caller]
            fn $method(self, other: &$other) -> <$type as $trait<$other>>::Output {
                $trait::$method(*self, *other)
            }
        }
    }
}

macro_rules! forward_ref_op_assign {
    (
        $(#[$attr:meta])*
        impl $trait:ident<$other:ty>::$method:ident for $type:ty
    ) => {
        $(#[$attr])*
        impl $trait<&$other> for $type {
            #[inline]
            #[track_caller]
            fn $method(&mut self, other: &$other) {
                $trait::$method(self, *other);
            }
        }
    }
}

pub(crate) use forward_ref_binop;
pub(crate) use forward_ref_op_assign;
pub(crate) use forward_ref_unop;

use arrow_format::ipc;

pub mod calculate;
pub mod write;

/// If and only if debug assertions are enabled (i.e. in debug builds) this function will panic if
/// the buffers do not increase monotonically. We don't enable this during release builds to
/// increase performance.
pub(crate) fn assert_buffer_monotonicity(
    #[cfg(debug_assertions)] buffers: &Vec<ipc::Buffer>,
    #[cfg(not(debug_assertions))] _: &Vec<ipc::Buffer>,
) {
    #[cfg(debug_assertions)]
    {
        let mut offset = 0;
        for buffer in buffers {
            debug_assert!(
                buffer.offset >= offset,
                "the offsets in the buffers must be an increasing set, but are not: the previous \
                 offset was {}, but the next one was {}",
                offset,
                buffer.offset
            );
            offset = buffer.offset;
        }
    }
}

mod macros {
    #[doc(hidden)]
    #[macro_export]
    macro_rules! match_integer_type {(
    $key_type:expr, | $_:tt $T:ident | $($body:tt)*
    ) => ({
        macro_rules! __with_ty__ {( $_ $T:ident ) => ( $($body)* )}
        use arrow2::datatypes::IntegerType::*;
        match $key_type {
            Int8 => __with_ty__! { i8 },
            Int16 => __with_ty__! { i16 },
            Int32 => __with_ty__! { i32 },
            Int64 => __with_ty__! { i64 },
            UInt8 => __with_ty__! { u8 },
            UInt16 => __with_ty__! { u16 },
            UInt32 => __with_ty__! { u32 },
            UInt64 => __with_ty__! { u64 },
        }
    })}

    #[doc(hidden)]
    #[macro_export]
    macro_rules! with_match_primitive_type {(
        $key_type:expr, | $_:tt $T:ident | $($body:tt)*
    ) => ({
        macro_rules! __with_ty__ {( $_ $T:ident ) => ( $($body)* )}
        use arrow2::datatypes::PrimitiveType::*;
        use arrow2::types::{days_ms, months_days_ns, f16};
        match $key_type {
            Int8 => __with_ty__! { i8 },
            Int16 => __with_ty__! { i16 },
            Int32 => __with_ty__! { i32 },
            Int64 => __with_ty__! { i64 },
            Int128 => __with_ty__! { i128 },
            DaysMs => __with_ty__! { days_ms },
            MonthDayNano => __with_ty__! { months_days_ns },
            UInt8 => __with_ty__! { u8 },
            UInt16 => __with_ty__! { u16 },
            UInt32 => __with_ty__! { u32 },
            UInt64 => __with_ty__! { u64 },
            Float16 => __with_ty__! { f16 },
            Float32 => __with_ty__! { f32 },
            Float64 => __with_ty__! { f64 },
        }
    })}
}

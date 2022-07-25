pub mod calculate;
pub mod write;

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
        use arrow2::types::{days_ms, months_days_ns};
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
            Float32 => __with_ty__! { f32 },
            Float64 => __with_ty__! { f64 },
        }
    })}
}

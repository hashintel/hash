// Adapted from serde

#[macro_export(local_inner_macros)]
macro_rules! forward_to_deserialize_any {
    (<$visitor:ident: Visitor<$lifetime:tt>> $($func:ident)*) => {
        $(forward_to_deserialize_any_helper!{$func<$lifetime, $visitor>})*
    };
    // This case must be after the previous one.
    ($($func:ident)*) => {
        $(forward_to_deserialize_any_helper!{$func<'de, V>})*
    };
}

#[doc(hidden)]
#[macro_export]
macro_rules! forward_to_deserialize_any_method {
    ($func:ident < $l:tt, $v:ident > ()) => {
        #[inline]
        fn $func<$v>(self, visitor: $v) -> error_stack::Result<$v::Value, $crate::DeserializerError>
        where
            $v: $crate::Visitor<$l>,
        {
            self.deserialize_any(visitor)
        }
    };
}

#[doc(hidden)]
#[macro_export(local_inner_macros)]
macro_rules! forward_to_deserialize_any_helper {
    (bool < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_bool<$l, $v>()}
    };
    (i8 < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_i8<$l, $v>()}
    };
    (i16 < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_i16<$l, $v>()}
    };
    (i32 < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_i32<$l, $v>()}
    };
    (i64 < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_i64<$l, $v>()}
    };
    (i128 < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_i128<$l, $v>()}
    };
    (isize < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_isize<$l, $v>()}
    };
    (u8 < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_u8<$l, $v>()}
    };
    (u16 < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_u16<$l, $v>()}
    };
    (u32 < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_u32<$l, $v>()}
    };
    (u64 < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_u64<$l, $v>()}
    };
    (u128 < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_u128<$l, $v>()}
    };
    (usize < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_usize<$l, $v>()}
    };
    (f32 < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_f32<$l, $v>()}
    };
    (f64 < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_f64<$l, $v>()}
    };
    (char < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_char<$l, $v>()}
    };
    (str < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_str<$l, $v>()}
    };
    (string < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_string<$l, $v>()}
    };
    (bytes < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_bytes<$l, $v>()}
    };
    (bytes_buffer < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_bytes_buffer<$l, $v>()}
    };
    (number < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_number<$l, $v>()}
    };
    (null < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_null<$l, $v>()}
    };
    (object < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_object<$l, $v>()}
    };
    (array < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_array<$l, $v>()}
    };
    (optional < $l:tt, $v:ident >) => {
        forward_to_deserialize_any_method! {deserialize_optional<$l, $v>()}
    };
}

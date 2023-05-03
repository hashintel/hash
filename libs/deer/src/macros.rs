// Adapted from serde

#[macro_export]
macro_rules! forward_to_deserialize_any {
    (<$visitor:ident: Visitor<$lifetime:tt>> $($func:ident)*) => {
        $($crate::forward_to_deserialize_any_helper!{$func<$lifetime, $visitor>})*
    };
    // This case must be after the previous one.
    ($($func:ident)*) => {
        $($crate::forward_to_deserialize_any_helper!{$func<'de, V>})*
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
#[macro_export]
macro_rules! forward_to_deserialize_any_helper {
    (bool < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_bool<$l, $v>()}
    };
    (i8 < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_i8<$l, $v>()}
    };
    (i16 < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_i16<$l, $v>()}
    };
    (i32 < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_i32<$l, $v>()}
    };
    (i64 < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_i64<$l, $v>()}
    };
    (i128 < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_i128<$l, $v>()}
    };
    (u8 < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_u8<$l, $v>()}
    };
    (u16 < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_u16<$l, $v>()}
    };
    (u32 < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_u32<$l, $v>()}
    };
    (u64 < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_u64<$l, $v>()}
    };
    (u128 < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_u128<$l, $v>()}
    };
    (f32 < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_f32<$l, $v>()}
    };
    (f64 < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_f64<$l, $v>()}
    };
    (char < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_char<$l, $v>()}
    };
    (str < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_str<$l, $v>()}
    };
    (string < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_string<$l, $v>()}
    };
    (bytes < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_bytes<$l, $v>()}
    };
    (bytes_buffer < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_bytes_buffer<$l, $v>()}
    };
    (number < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_number<$l, $v>()}
    };
    (null < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_null<$l, $v>()}
    };
    (object < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_object<$l, $v>()}
    };
    (array < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_array<$l, $v>()}
    };
    (optional < $l:tt, $v:ident >) => {
        $crate::forward_to_deserialize_any_method! {deserialize_optional<$l, $v>()}
    };
}

#[macro_export]
macro_rules! identifier {
    (@internal match arm $name:ident :: $variant:ident => _) => {};

    (@internal match arm $name:ident :: $variant:ident => $value:literal) => {
        $value => Ok($name :: $variant),
    };

    ($vis:vis enum $name:ident { $($variant:ident = $str:tt | $bytes:tt | $u64:tt),* $(,)? }) => {
        #[derive(Debug, Copy, Clone)]
        $vis enum $name {
            $($variant),*
        }

        impl $crate::Reflection for $name {
            fn schema(doc: &mut $crate::Document) -> $crate::Schema {
                todo!()
            }
        }

        impl<'de> $crate::Deserialize<'de> for $name {
            type Reflection = Self;

            fn deserialize<D>(deserializer: D) -> $crate::export::error_stack::Result<Self, $crate::error::DeserializeError> where D: $crate::Deserializer<'de> {
                struct Visitor;

                impl<'de> $crate::IdentifierVisitor<'de> for Visitor {
                    type Value = $name;

                    fn expecting(&self) -> $crate::Document {
                        Self::Value::document()
                    }

                    fn visit_str(self, value: &str) -> $crate::export::error_stack::Result<Self::Value, $crate::error::VisitorError> {
                        match value {
                            $($crate::identifier!(@internal match arm $name :: $variant => $str))*
                        }
                    }

                    fn visit_bytes(self, value: &[u8]) -> $crate::export::error_stack::Result<Self::Value, $crate::error::VisitorError> {
                        match value {
                            // $($crate::identifier!(@internal match arm $name :: $variant => $bytes))*
                        }
                    }

                    fn visit_u64(self, value: u64) -> $crate::export::error_stack::Result<Self::Value, $crate::error::VisitorError> {
                        match value {
                            // $($crate::identifier!(@internal match arm $name :: $variant => $u64))*
                        }
                    }
                }

                deserializer
                    .deserialize_identifier(Visitor)
                    .map_err(|error| error.change_context($crate::error::DeserializeError))
            }
        }
    };
}

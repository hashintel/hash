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
        fn $func<$v>(
            self,
            visitor: $v,
        ) -> ::core::result::Result<
            $v::Value,
            $crate::export::error_stack::Report<$crate::DeserializerError>,
        >
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

/// Helper macro for implementing an identifier deserializer.
///
/// The syntax is:
///
/// ```rust
/// use deer::identifier;
///
/// identifier! {
///     pub enum Identifier {
///         // identifiers can be used in different places, depending on the deserializer
///         // they support str, bytes, and u64
///         VariantName = "StrVariant" | b"ByteVariant" | 2,
///         // You can exclude a specific variant from one of the `visit_` method implementations
///         // by replacing the value with `_`
///         VariantName2 = _ | b"ByteVariant" | 2,
///         // if there's a duplicate value for a variant, the first one declared will be used.
///         // duplicate variants (not their value(!)) will lead to a compile error
///     }
/// }
/// ```
///
/// # Implementation
///
/// Internally this macro will generate a `match` statement for the `visit_str`, `visit_bytes`, and
/// `visit_u64` methods. Because all generated code must be valid rust, the macro will not generate
/// the match arms first, but instead utilize a stack to generate the match arms.
///
/// There are two stacks used, one for the match arms, and one for the variant values. The variant
/// values stack is used to provide error messages (as to which variant was expected).
///
/// Roughly the match internal macro can be described as:
///
/// ```text
/// @internal match
///     $ty, // <- the type of visit function in which it is used, either `str`, `bytes`, or `u64`
///     $e; // <- the expression we want to match against
///     $name // <- the name of enum we're generating the match for
///     @() // <- the stack of variants to be processed, every entry is a tuple of the form `(variant, value | _)`
///     @() // <- the stack of values, used to generate error messages, will be added to in every iteration
///     $($arms:tt)* // <- generated match arms
/// ```
#[macro_export]
macro_rules! identifier {
    (@internal
        match $ty:tt, $e:expr; $name:ident
            @(($variant:ident, _) $(, $rest:tt)*)
            @($($stack:literal),*)
            $($arms:tt)*
    ) => {
        $crate::identifier!(@internal
            match $ty, $e; $name
                @($($rest),*)
                @($($stack),*)
                $($arms)*
        )
    };
    (@internal
        match $ty:tt, $e:expr; $name:ident
            @(($variant:ident, $value:literal) $(, $rest:tt)*)
            @($($stack:literal),*)
            $($arms:tt)*
    ) => {
        $crate::identifier!(@internal
            match $ty, $e; $name
                @($($rest),*)
                @($($stack, )* $value)
                $($arms)* $value => Ok($name::$variant),
        )
    };

    (@internal
        match str, $e:expr; $name:ident
            @()
            @($($stack:literal),*)
            $($arms:tt)*
    ) => {
        match $e {
            $($arms)*
            value => Err(
                $crate::export::error_stack::Report::new(
                    $crate::error::Variant::into_error(
                        $crate::error::UnknownIdentifierError
                    )
                )
                $(
                    .attach($crate::error::ExpectedIdentifier::String($stack))
                )*
                .attach($crate::error::ReceivedIdentifier::String($crate::export::alloc::borrow::ToOwned::to_owned(value)))
                .change_context($crate::error::VisitorError)
            )
        }
    };

    (@internal
        match bytes, $e:expr; $name:ident
            @()
            @($($stack:literal),*)
            $($arms:tt)*
    ) => {
        match $e {
            $($arms)*
            value => Err(
                $crate::export::error_stack::Report::new(
                    $crate::error::Variant::into_error(
                        $crate::error::UnknownIdentifierError
                    )
                )
                $(
                    .attach($crate::error::ExpectedIdentifier::Bytes($stack))
                )*
                .attach($crate::error::ReceivedIdentifier::Bytes($crate::export::alloc::borrow::ToOwned::to_owned(value)))
                .change_context($crate::error::VisitorError)
            )
        }
    };

    (@internal
        match u64, $e:expr; $name:ident
            @()
            @($($stack:literal),*)
            $($arms:tt)*
    ) => {
        match $e {
            $($arms)*
            value => Err(
                $crate::export::error_stack::Report::new(
                    $crate::error::Variant::into_error(
                        $crate::error::UnknownIdentifierError
                    )
                )
                $(
                    .attach($crate::error::ExpectedIdentifier::U64($stack))
                )*
                .attach($crate::error::ReceivedIdentifier::U64(value))
                .change_context($crate::error::VisitorError)
            )
        }
    };

    (@internal reflection $name:ident;
        @($next:literal $(, $rest:tt)*)
        @($($stack:literal),*)
    ) => {
        $crate::identifier!(
            @internal reflection $name;
                @($($rest),*)
                @($($stack, )* $next)
        );
    };

    (@internal reflection $name:ident;
        @(_ $(, $rest:tt)*)
        @($($stack:literal),*)
    ) => {
        $crate::identifier!(
            @internal reflection $name;
                @($($rest),*)
                @($($stack),*)
        );
    };

    (@internal reflection $name:ident;
        @()
        @($($stack:literal),*)
    ) => {
        impl $crate::Reflection for $name {
            fn schema(_: &mut $crate::Document) -> $crate::Schema {
                // we lack the ability to properly express OR, so for now we just default to
                // output the string representation
                $crate::Schema::new("string").with("enum", [$($stack),*])
            }
        }
    };


    (
        $(#[$meta:meta])*
        $vis:vis enum $name:ident {
            $($variant:ident = $str:tt | $bytes:tt | $u64:tt),* $(,)?
        }
    ) => {
        $(#[$meta])*
        #[derive(Debug, Copy, Clone)]
        $vis enum $name {
            $($variant),*
        }

        $crate::identifier!(
            @internal reflection $name;
                @($($str),*)
                @()
        );

        impl<'de> $crate::Deserialize<'de> for $name {
            type Reflection = Self;

            fn deserialize<D>(deserializer: D) -> ::core::result::Result<Self, $crate::export::error_stack::Report<$crate::error::DeserializeError>> where D: $crate::Deserializer<'de> {
                struct Visitor;

                impl<'de> $crate::IdentifierVisitor<'de> for Visitor {
                    type Value = $name;

                    fn expecting(&self) -> $crate::Document {
                        <Self::Value as $crate::Reflection>::document()
                    }

                    fn visit_str(self, value: &str) -> ::core::result::Result<Self::Value, $crate::export::error_stack::Report<$crate::error::VisitorError>> {
                        identifier!(@internal
                            match str, value; $name
                            @($(($variant, $str)),*)
                            @()
                        )
                    }

                    fn visit_bytes(self, value: &[u8]) -> ::core::result::Result<Self::Value, $crate::export::error_stack::Report<$crate::error::VisitorError>> {
                        identifier!(@internal
                            match bytes, value; $name
                            @($(($variant, $bytes)),*)
                            @()
                        )
                    }

                    fn visit_u64(self, value: u64) -> ::core::result::Result<Self::Value, $crate::export::error_stack::Report<$crate::error::VisitorError>> {
                        identifier!(@internal
                            match u64, value; $name
                            @($(($variant, $u64)),*)
                            @()
                        )
                    }
                }

                deserializer
                    .deserialize_identifier(Visitor)
                    .map_err(|error| error.change_context($crate::error::DeserializeError))
            }
        }
    };
}

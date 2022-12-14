/// # impl_error! generates simple error_stack errors.
/// ```
/// use error_stack::Report;
/// use error_stack_macros::impl_error;
/// impl_error!(MyError, "This is my error!");
/// assert_eq!(
///     format!("{}", Report::new(MyError)),
///     "MyError: This is my error!"
/// );
/// ```

#[macro_export]
macro_rules! impl_error {
    ($etype:ident, $desc:literal) => {
        #[derive(Debug)]
        pub struct $etype;

        impl std::fmt::Display for $etype {
            fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                fmt.write_str(&format!("{:?}: {}", self, $desc))
            }
        }
        impl error_stack::Context for $etype {}
    };
}

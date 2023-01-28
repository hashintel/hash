pub(crate) mod context;

use alloc::vec::Vec;

use crate::{
    fmt::{install_builtin_hooks, Hooks},
    Report,
};

#[cfg(feature = "std")]
type RwLock<T> = std::sync::RwLock<T>;

// Generally the std mutex is faster than spin, so if both `std` and `hooks` is enabled we use the
// std variant.
#[cfg(all(not(feature = "std"), feature = "hooks"))]
type RwLock<T> = spin::rwlock::RwLock<T>;

static FMT_HOOK: RwLock<Hooks> = RwLock::new(Hooks { inner: Vec::new() });

impl Report<()> {
    /// Can be used to globally set a [`Debug`] format hook, for a specific type `T`.
    ///
    /// This hook will be called on every [`Debug`] call, if an attachment with the same type has
    /// been found.
    ///
    /// [`Debug`]: core::fmt::Debug
    ///
    /// # Examples
    ///
    /// ```
    /// # // we only test the snapshot on rust 1.65, therefore report is unused (so is render)
    /// # #![cfg_attr(not(rust_1_65), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io::{Error, ErrorKind};
    ///
    /// use error_stack::{
    ///     report, Report,
    /// };
    ///
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|value, context| {
    ///     context.push_body(format!("suggestion: {}", value.0));
    /// });
    ///
    /// let report =
    ///     report!(Error::from(ErrorKind::InvalidInput)).attach(Suggestion("oh no, try again"));
    ///
    /// # Report::set_color_mode(Some(error_stack::fmt::ColorMode::Color));
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/hook__debug_hook.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// ```
    ///
    /// Which will result in something like:
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/hook__debug_hook.snap"))]
    /// </pre>
    ///
    /// This example showcases the ability of hooks to be invoked for values provided via the
    /// Provider API using [`Error::provide`].
    ///
    /// ```
    /// # // this is a lot of boilerplate, if you find a better way, please change this!
    /// # // with #![cfg(nightly)] docsrs will complain that there's no main in non-nightly
    /// # #![cfg_attr(nightly, feature(error_generic_member_access, provide_any))]
    /// # const _: &'static str = r#"
    /// #![feature(error_generic_member_access, provide_any)]
    /// # "#;
    ///
    /// # #[cfg(nightly)]
    /// # mod nightly {
    /// use std::any::Demand;
    /// use std::error::Error;
    /// use std::fmt::{Display, Formatter};
    /// use error_stack::{Report, report};
    ///
    /// struct Suggestion(&'static str);
    ///
    /// #[derive(Debug)]
    /// struct ErrorCode(u64);
    ///
    ///
    /// #[derive(Debug)]
    /// struct UserError {
    ///     code: ErrorCode
    /// }
    ///
    /// impl Display for UserError {
    ///     fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
    ///         f.write_str("invalid user input")
    ///     }
    /// }
    ///
    /// impl Error for UserError {
    ///  fn provide<'a>(&'a self, req: &mut Demand<'a>) {
    ///    req.provide_value(Suggestion("try better next time!"));
    ///    req.provide_ref(&self.code);
    ///  }
    /// }
    ///
    /// # pub fn main() {
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(value), context| {
    ///     context.push_body(format!("suggestion: {value}"));
    /// });
    /// Report::install_debug_hook::<ErrorCode>(|ErrorCode(value), context| {
    ///     context.push_body(format!("error code: {value}"));
    /// });
    ///
    /// let report = report!(UserError {code: ErrorCode(420)});
    ///
    /// # Report::set_color_mode(Some(error_stack::fmt::ColorMode::Color));
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/hook__debug_hook_provide.snap")].assert_eq(&render(format!("{report:?}")));
    /// #
    /// println!("{report:?}");
    /// # }
    /// # }
    /// # #[cfg(not(nightly))]
    /// # fn main() {}
    /// # #[cfg(nightly)]
    /// # fn main() {nightly::main()}
    /// ```
    ///
    /// Which will result in something like:
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/hook__debug_hook_provide.snap"))]
    /// </pre>
    ///
    /// [`Error::provide`]: std::error::Error::provide
    #[cfg(any(feature = "std", feature = "hooks"))]
    pub fn install_debug_hook<T: Send + Sync + 'static>(
        hook: impl Fn(&T, &mut crate::fmt::HookContext<T>) + Send + Sync + 'static,
    ) {
        install_builtin_hooks();

        #[cfg(feature = "std")]
        let mut lock = FMT_HOOK.write().expect("should not be poisoned");

        // The spin RwLock cannot panic
        #[cfg(all(not(feature = "std"), feature = "hooks"))]
        let mut lock = FMT_HOOK.write();

        lock.insert(hook);
    }

    /// Returns the hook that was previously set by [`install_debug_hook`]
    ///
    /// [`install_debug_hook`]: Self::install_debug_hook
    #[cfg(any(feature = "std", feature = "hooks"))]
    pub(crate) fn invoke_debug_format_hook<T>(closure: impl FnOnce(&Hooks) -> T) -> T {
        install_builtin_hooks();

        #[cfg(feature = "std")]
        let hook = FMT_HOOK.read().expect("should not be poisoned");

        // The spin RwLock cannot panic
        #[cfg(all(not(feature = "std"), feature = "hooks"))]
        let hook = FMT_HOOK.read();

        closure(&hook)
    }
}

#[doc(hidden)]
pub mod __private {
    use core::fmt;

    use crate::Report;

    pub mod kinds {
        use core::{fmt, marker::PhantomData};

        use crate::{Context, Report};

        pub trait AdhocKind: Sized {
            fn __kind(&self) -> Adhoc {
                Adhoc
            }
        }
        impl<T> AdhocKind for &T where T: ?Sized + fmt::Display + fmt::Debug + Send + Sync + 'static {}

        pub struct Adhoc;
        impl Adhoc {
            #[allow(clippy::unused_self)]
            pub fn report<C>(self, message: C) -> Report
            where
                C: Context,
            {
                Report::new(message)
            }
        }

        pub trait TraitKind<S>: Sized {
            fn __kind(&self) -> Trait<S> {
                Trait(PhantomData)
            }
        }
        impl<E, S> TraitKind<S> for E where E: Into<Report<S>> {}

        pub struct Trait<S>(PhantomData<S>);
        impl<S> Trait<S> {
            #[allow(clippy::unused_self)]
            pub fn report<E: Into<Report<S>>>(self, error: E) -> Report<S> {
                error.into()
            }
        }
    }

    pub fn format_err(args: fmt::Arguments) -> Report {
        Report::new(alloc::format!("{}", args))
    }
}

/// Creates a [`Report`] from the given parameters.
///
/// Optionally a scope can be specified.
///
/// [`Report`]: crate::Report
///
/// # Examples
///
/// Create a [`Report`] from a message:
///
/// ```
/// # fn has_permission(user: &User, resource: &Resource) -> bool { false }
/// # struct User;
/// # struct Resource;
/// # use core::fmt;
/// # impl fmt::Display for Resource { fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// use error::format_err;
///
/// # fn use_resource(user: User, resource: Resource) -> error::Result<()> {
/// if !has_permission(&user, &resource) {
///     return Err(format_err!("permission denied for accessing {resource}"));
/// }
/// # Ok(()) }
/// # let err = use_resource(User, Resource).unwrap_err();
/// # assert_eq!(err.frames().count(), 1);
/// # assert_eq!(err.frames().next().unwrap().to_string(), "permission denied for accessing ");
/// ```
///
/// Create a [`Report`] from an error:
///
/// ```
/// # #[cfg(not(miri))]
/// # use std::fs;
/// # use error::format_err;
/// # fn func() -> error::Result<()> {
/// # #[cfg(not(miri))]
/// match fs::read_to_string("/path/to/file") {
///     Ok(content) => println!("File contents: {content}"),
///     Err(err) => return Err(format_err!(err)),
/// }
/// # #[cfg(miri)]
/// # error::bail!("");
/// # Ok(())
/// # }
/// # let err = func().unwrap_err();
/// # assert_eq!(err.frames().count(), 1);
/// ```
///
/// Optionally, an [`ErrorKind`][crate::ErrorKind] can be provided:
/// ```
/// # fn has_permission(user: &User, resource: &Resource) -> bool { false }
/// # #[derive(Debug)] struct User;
/// # #[derive(Debug)] struct Resource;
/// # use error::format_err;
/// # impl fmt::Display for User { fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// # impl fmt::Display for Resource { fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// use core::fmt;
///
/// use error::{ErrorKind, Report};
/// use provider::{Provider, Requisition};
///
/// #[derive(Debug)]
/// struct PermissionDenied(User, Resource);
///
/// impl fmt::Display for PermissionDenied {
///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///         write!(fmt, "{} must not access {}", self.0, self.1)
///     }
/// }
///
/// impl ErrorKind for PermissionDenied {
///     fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
///         req.provide_ref(&self.0).provide_ref(&self.1);
///     }
/// }
///
/// # fn use_resource(user: User, resource: Resource) -> Result<(), Report<PermissionDenied>> {
/// if !has_permission(&user, &resource) {
///     return Err(format_err!(
///         error_kind: PermissionDenied(user, resource),
///         "permission denied accessing {resource}"
///     ));
/// }
/// # Ok(()) }
/// # let err = use_resource(User, Resource).unwrap_err();
/// # assert_eq!(err.frames().count(), 2);
/// # assert_eq!(err.request_ref::<User>().count(), 1);
/// # assert_eq!(err.request_ref::<Resource>().count(), 1);
/// ```
#[macro_export]
macro_rules! format_err {
    (error_kind: $error_kind:expr $(,)?) => ({
        $crate::Report::from_error_kind($error_kind)
    });
    (error_kind: $error_kind:expr, $msg:literal $(,)?) => ({
        $crate::format_err!($msg).error_kind($error_kind)
    });
    (error_kind: $error_kind:expr, $err:expr $(,)?) => ({
        $crate::format_err!($err).error_kind($error_kind)
    });
    (error_kind: $error_kind:expr, $fmt:expr, $($arg:tt)+) => {
        $crate::format_err!($fmt, $($arg)+).error_kind($error_kind)
    };
    ($msg:literal $(,)?) => ({
        $crate::Report::new($crate::__private::format_err(core::format_args!($msg)))
    });
    ($err:expr $(,)?) => ({
        use $crate::__private::kinds::*;
        let error = $err;
        (&error).__kind().report(error)
    });
    ($fmt:expr, $($arg:tt)+) => {
        $crate::Report::new($crate::__private::format_err(core::format_args!($fmt, $($arg)+)))
    };
}

/// Creates a [`Report`] and returns it as [`Result`].
///
/// Shorthand for `return Err(`[`format_err!(...)`]`)`
///
/// [`Report`]: crate::Report
/// [`format_err!(...)`]: format_err
///
/// # Examples
///
/// Create a [`Report`] from a message:
///
/// ```
/// # fn has_permission(user: &User, resource: &Resource) -> bool { false }
/// # struct User;
/// # struct Resource;
/// # use core::fmt;
/// # impl fmt::Display for Resource { fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// use error::bail;
///
/// # fn use_resource(user: User, resource: Resource) -> error::Result<()> {
/// if !has_permission(&user, &resource) {
///     bail!("permission denied for accessing {resource}");
/// }
/// # Ok(()) }
/// # let err = use_resource(User, Resource).unwrap_err();
/// # assert_eq!(err.frames().count(), 1);
/// # assert_eq!(err.frames().next().unwrap().to_string(), "permission denied for accessing ");
/// ```
///
/// Create a [`Report`] from an error:
///
/// ```
/// # use std::fs;
/// # use error::bail;
/// # fn func() -> error::Result<()> {
/// # #[cfg(not(miri))]
/// match fs::read_to_string("/path/to/file") {
///     Ok(content) => println!("File contents: {content}"),
///     Err(err) => bail!(err),
/// }
/// # #[cfg(miri)]
/// # bail!("");
/// # Ok(())
/// # }
/// # let err = func().unwrap_err();
/// # assert_eq!(err.frames().count(), 1);
/// ```
///
/// Optionally, an [`ErrorKind`][crate::ErrorKind] can be provided:
///
/// ```
/// # fn has_permission(user: &User, resource: &Resource) -> bool { false }
/// # #[derive(Debug)] struct User;
/// # #[derive(Debug)] struct Resource;
/// # use error::bail;
/// # impl fmt::Display for User { fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// # impl fmt::Display for Resource { fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// use core::fmt;
///
/// use error::{ErrorKind, Report};
/// use provider::{Provider, Requisition};
///
/// #[derive(Debug)]
/// struct PermissionDenied(User, Resource);
///
/// impl fmt::Display for PermissionDenied {
///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///         write!(fmt, "{} must not access {}", self.0, self.1)
///     }
/// }
///
/// impl ErrorKind for PermissionDenied {
///     fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
///         req.provide_ref(&self.0).provide_ref(&self.1);
///     }
/// }
///
/// # fn use_resource(user: User, resource: Resource) -> Result<(), Report<PermissionDenied>> {
/// if !has_permission(&user, &resource) {
///     bail!(
///         error_kind: PermissionDenied(user, resource),
///         "permission denied for accessing {resource}"
///     );
/// }
/// # Ok(()) }
/// # let err = dbg!(use_resource(User, Resource).unwrap_err());
/// # assert_eq!(err.frames().count(), 2);
/// # assert_eq!(err.request_ref::<Resource>().count(), 1);
/// # assert_eq!(err.request_ref::<User>().count(), 1);
/// ```
#[macro_export]
macro_rules! bail {
    (error_kind: $error_kind:expr $(,)?) => ({
        return $crate::Result::Err($crate::format_err!(error_kind: $error_kind))
    });
    (error_kind: $error_kind:expr, $msg:literal $(,)?) => ({
        return $crate::Result::Err($crate::format_err!(error_kind: $error_kind, $msg))
    });
    (error_kind: $error_kind:expr, $err:expr $(,)?) => ({
        return $crate::Result::Err($crate::format_err!(error_kind: $error_kind, $err))
    });
    (error_kind: $error_kind:expr, $fmt:expr, $($arg:tt)+) => {
        return $crate::Result::Err($crate::format_err!(error_kind: $error_kind, $fmt, $($arg)+))
    };
    ($msg:literal $(,)?) => ({
        return $crate::Result::Err($crate::format_err!($msg))
    });
    ($err:expr $(,)?) => ({
        return $crate::Result::Err($crate::format_err!($err))
    });
    ($fmt:expr, $($arg:tt)+) => {
        return $crate::Result::Err($crate::format_err!($fmt, $($arg)+))
    };
}

/// Ensures `$cond` is met, otherwise return an error.
///
/// Shorthand for `if !$cond { `[`bail!(...)`]`) }`
///
/// [`Report`]: crate::Report
/// [`bail!(...)`]: bail
///
/// # Examples
///
/// Create a [`Report`] from a message:
///
/// ```
/// # fn has_permission(user: &User, resource: &Resource) -> bool { false }
/// # struct User;
/// # struct Resource;
/// # use core::fmt;
/// # impl fmt::Display for Resource { fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// use error::ensure;
///
/// # fn use_resource(user: User, resource: Resource) -> error::Result<()> {
/// ensure!(has_permission(&user, &resource), "permission denied for accessing {resource}");
/// # Ok(()) }
/// # let err = use_resource(User, Resource).unwrap_err();
/// # assert_eq!(err.frames().count(), 1);
/// # assert_eq!(err.frames().next().unwrap().to_string(), "permission denied for accessing ");
/// ```
///
/// Optionally, an [`ErrorKind`][crate::ErrorKind] can be provided:
///
/// ```
/// # fn has_permission(user: &User, resource: &Resource) -> bool { false }
/// # #[derive(Debug)] struct User;
/// # #[derive(Debug)] struct Resource;
/// # use error::ensure;
/// # impl fmt::Display for User { fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// # impl fmt::Display for Resource { fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// use core::fmt;
///
/// use error::{ErrorKind, Report};
/// use provider::{Provider, Requisition};
///
/// #[derive(Debug)]
/// struct PermissionDenied(User, Resource);
///
/// impl fmt::Display for PermissionDenied {
///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///         write!(fmt, "{} must not access {}", self.0, self.1)
///     }
/// }
///
/// impl ErrorKind for PermissionDenied {
///     fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
///         req.provide_ref(&self.0).provide_ref(&self.1);
///     }
/// }
///
/// # fn use_resource(user: User, resource: Resource) -> Result<(), Report<PermissionDenied>> {
/// ensure!(
///     has_permission(&user, &resource),
///     error_kind: PermissionDenied(user, resource),
///     "permission denied for accessing {resource}",
/// );
/// # Ok(()) }
/// # let err = use_resource(User, Resource).unwrap_err();
/// # assert_eq!(err.frames().count(), 2);
/// # assert_eq!(err.request_ref::<User>().count(), 1);
/// # assert_eq!(err.request_ref::<Resource>().count(), 1);
/// ```
///
/// [`Report`]: crate::Report
#[macro_export]
macro_rules! ensure {
    ($cond:expr, error_kind: $error_kind:expr $(,)?) => ({
        if !$cond {
            $crate::bail!(error_kind: $error_kind)
        }
    });
    ($cond:expr, error_kind: $error_kind:expr, $msg:literal $(,)?) => ({
        if !$cond {
            $crate::bail!(error_kind: $error_kind, $msg)
        }
    });
    ($cond:expr, error_kind: $error_kind:expr, $err:expr $(,)?) => ({
        if !$cond {
            $crate::bail!(error_kind: $error_kind, $err)
        }
    });
    ($cond:expr, error_kind: $error_kind:expr, $fmt:expr, $($arg:tt)+) => {
        if !$cond {
            $crate::bail!(error_kind: $error_kind, $fmt, $($arg)+)
        }
    };
    ($cond:expr, $msg:literal $(,)?) => ({
        if !$cond {
            $crate::bail!($msg)
        }
    });
    ($cond:expr, $err:expr $(,)?) => ({
        if !$cond {
            $crate::bail!($err)
        }
    });
    ($cond:expr, $fmt:expr, $($arg:tt)*) => {
        if !$cond {
            $crate::bail!($fmt, $($arg)*)
        }
    };
}

#[cfg(test)]
mod tests {
    #[allow(clippy::wildcard_imports)]
    use crate::test_helper::*;

    #[test]
    fn format_err() {
        let err = capture_error(|| Err(format_err!(error_kind: ErrorKindA(10))));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), ["Error Kind A"]);

        let err = capture_error(|| Err(format_err!(error_kind: ErrorKindA(10), "Literal")));
        assert_eq!(err.frames().count(), 2);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), ["Error Kind A", "Literal"]);

        let err = capture_error(|| Err(format_err!(error_kind: ErrorKindA(10), CONTEXT_A)));
        assert_eq!(err.frames().count(), 2);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), ["Error Kind A", "Context A"]);

        let var = "foo";
        let err = capture_error(|| {
            Err(format_err!(error_kind: ErrorKindA(10), "Format String: {}", var))
        });
        assert_eq!(err.frames().count(), 2);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), [
            "Error Kind A",
            "Format String: foo"
        ]);

        let var = "foo";
        let err =
            capture_error(|| Err(format_err!(error_kind: ErrorKindA(10), "Format String: {var}")));
        assert_eq!(err.frames().count(), 2);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), [
            "Error Kind A",
            "Format String: foo"
        ]);

        let err = capture_error(|| Err(format_err!("Literal")));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Literal"]);

        let err = capture_error(|| Err(format_err!(CONTEXT_A)));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Context A"]);

        let var = "foo";
        let err = capture_error(|| Err(format_err!("Format String: {}", var)));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Format String: foo"]);

        let var = "foo";
        let err = capture_error(|| Err(format_err!("Format String: {var}")));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Format String: foo"]);
    }

    #[test]
    fn bail() {
        let err = capture_error(|| bail!(error_kind: ErrorKindA(10)));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), ["Error Kind A"]);

        let err = capture_error(|| bail!(error_kind: ErrorKindA(10), "Literal"));
        assert_eq!(err.frames().count(), 2);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), ["Error Kind A", "Literal"]);

        let err = capture_error(|| bail!(error_kind: ErrorKindA(10), CONTEXT_A));
        assert_eq!(err.frames().count(), 2);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), ["Error Kind A", "Context A"]);

        let var = "foo";
        let err = capture_error(|| bail!(error_kind: ErrorKindA(10), "Format String: {}", var));
        assert_eq!(err.frames().count(), 2);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), [
            "Error Kind A",
            "Format String: foo"
        ]);

        let var = "foo";
        let err = capture_error(|| bail!(error_kind: ErrorKindA(10), "Format String: {var}"));
        assert_eq!(err.frames().count(), 2);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), [
            "Error Kind A",
            "Format String: foo"
        ]);

        let err = capture_error(|| bail!("Literal"));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Literal"]);

        let err = capture_error(|| bail!(CONTEXT_A));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Context A"]);

        let var = "foo";
        let err = capture_error(|| bail!("Format String: {}", var));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Format String: foo"]);

        let var = "foo";
        let err = capture_error(|| bail!("Format String: {var}"));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Format String: foo"]);
    }

    #[test]
    fn ensure() {
        let err = capture_error(|| {
            ensure!(false, error_kind: ErrorKindA(10));
            Ok(())
        });
        assert_eq!(err.frames().count(), 1);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), ["Error Kind A"]);

        let err = capture_error(|| {
            ensure!(false, error_kind: ErrorKindA(10), "Literal");
            Ok(())
        });
        assert_eq!(err.frames().count(), 2);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), ["Error Kind A", "Literal"]);

        let err = capture_error(|| {
            ensure!(false, error_kind: ErrorKindA(10), CONTEXT_A);
            Ok(())
        });
        assert_eq!(err.frames().count(), 2);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), ["Error Kind A", "Context A"]);

        let var = "foo";
        let err = capture_error(|| {
            ensure!(false, error_kind: ErrorKindA(10), "Format String: {}", var);
            Ok(())
        });
        assert_eq!(err.frames().count(), 2);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), [
            "Error Kind A",
            "Format String: foo"
        ]);

        let var = "foo";
        let err = capture_error(|| {
            ensure!(false, error_kind: ErrorKindA(10), "Format String: {var}");
            Ok(())
        });
        assert_eq!(err.frames().count(), 2);
        assert_eq!(err.request::<TagA>().collect::<Vec<_>>(), [10]);
        assert_eq!(request_messages(&err), [
            "Error Kind A",
            "Format String: foo"
        ]);

        let err = capture_error(|| {
            ensure!(false, "Literal");
            Ok(())
        });
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Literal"]);

        let err = capture_error(|| {
            ensure!(false, CONTEXT_A);
            Ok(())
        });
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Context A"]);

        let var = "foo";
        let err = capture_error(|| {
            ensure!(false, "Format String: {}", var);
            Ok(())
        });
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Format String: foo"]);

        let var = "foo";
        let err = capture_error(|| {
            ensure!(false, "Format String: {var}");
            Ok(())
        });
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Format String: foo"]);
    }
}

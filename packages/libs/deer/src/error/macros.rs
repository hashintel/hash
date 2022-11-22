#[macro_export]
macro_rules! id {
    [$($segment:literal),+] => {
        $crate::error::Id::new(&[$($segment),*])
    };
}

macro_rules! impl_error {
    ($name:ident) => {
        #[cfg(nightly)]
        impl core::error::Error for $name {}

        #[cfg(all(not(nightly), not(feature = "std")))]
        impl error_stack::Context for $name {}

        #[cfg(all(not(nightly), feature = "std"))]
        impl std::error::Error for $name {}
    };
}

pub(crate) use impl_error;

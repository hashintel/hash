#[macro_export]
macro_rules! id {
    [$($segment:literal),+] => {
        $crate::error::Id::new(&[$($segment),*])
    };
}

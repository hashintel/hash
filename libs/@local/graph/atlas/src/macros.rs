macro_rules! nz {
    ($expr:expr) => {
        const { NonZero::new($expr).unwrap() }
    };
}

pub(crate) use nz;

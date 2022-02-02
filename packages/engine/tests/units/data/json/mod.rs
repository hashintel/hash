mod js {
    use crate::run_test;

    run_test!(access, JavaScript);
    run_test!(immutable, JavaScript);
}

mod py {
    use crate::run_test;

    run_test!(access, Python);
    // TODO - test disabled until we make it so that the data actually is immutable
    run_test!(immutable, Python, #[ignore]);
}

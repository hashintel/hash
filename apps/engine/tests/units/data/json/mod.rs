mod js {
    use crate::run_test;

    run_test!(access, JavaScript);
    run_test!(immutable, JavaScript);
}

mod py {
    use crate::run_test;

    run_test!(access, Python);
    run_test!(immutable, Python, #[ignore = "bug: Datasets are currently not immutable in Python"]);
}

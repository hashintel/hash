mod js {
    use crate::run_test;

    run_test!(access, JavaScript);
    run_test!(immutable, JavaScript);
}

mod py {
    use crate::run_test;

    run_test!(access, Python, #[ignore]);
    run_test!(immutable, Python, #[ignore]);
}

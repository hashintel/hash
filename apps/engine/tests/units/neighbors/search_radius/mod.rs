mod js {
    use crate::run_test;

    run_test!(global, JavaScript);
    run_test!(local, JavaScript);
}

mod py {
    use crate::run_test;

    run_test!(global, Python);
    run_test!(local, Python);
}

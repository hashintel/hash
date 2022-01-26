mod js {
    use crate::run_test;

    run_test!(access_from_behaviors, JavaScript);
    run_test!(access_from_init, JavaScript);
    run_test!(immutable_from_behaviors, JavaScript);
    run_test!(immutable_from_init, JavaScript);
}

mod py {
    use crate::run_test;

    run_test!(access_from_behaviors, Python);
    run_test!(access_from_init, Python);
    run_test!(immutable_from_behaviors, Python);
    run_test!(immutable_from_init, Python);
}

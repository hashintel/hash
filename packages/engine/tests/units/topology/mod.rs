mod js {
    mod distance {
        use crate::run_test;

        run_test!(distance, JavaScript, experiment: euclidean_squared);
        run_test!(distance, JavaScript, experiment: manhattan);
        run_test!(distance, JavaScript, experiment: euclidean);
        run_test!(distance, JavaScript, experiment: conway);
    }

    mod wrapping {
        use crate::run_test;

        run_test!(wrapping, JavaScript, experiment: torus);
        run_test!(wrapping, JavaScript, experiment: spherical);
        run_test!(wrapping, JavaScript, experiment: reflection);
    }
}

mod py {
    mod distance {
        use crate::run_test;

        run_test!(distance, Python, experiment: euclidean_squared, #[ignore]);
        run_test!(distance, Python, experiment: manhattan, #[ignore]);
        run_test!(distance, Python, experiment: euclidean, #[ignore]);
        run_test!(distance, Python, experiment: conway, #[ignore]);
    }

    mod wrapping {
        use crate::run_test;

        run_test!(wrapping, Python, experiment: torus, #[ignore]);
        run_test!(wrapping, Python, experiment: spherical, #[ignore]);
        run_test!(wrapping, Python, experiment: reflection, #[ignore]);
    }
}

use crate::run_test;

// https://core.hash.ai/@hash/city-infection-model/6.4.2
mod city_infection_model {
    use crate::run_test;

    run_test!(city_infection_model, experiment: infected_linspace);
    run_test!(city_infection_model, experiment: duration_range_monte_carlo);
}

// https://core.hash.ai/@hash/sugarscape/7.5.0
mod sugarscape {
    use crate::run_test;

    // optimization experiment is not implemented
    run_test!(sugarscape, experiment: minimize_the_gini_coefficient, #[ignore]);
    run_test!(sugarscape, experiment: initial_sugar_linear_sweep);
    run_test!(sugarscape, experiment: agent_density_linspace);
    // optimization experiment is not implemented
    run_test!(sugarscape, experiment: max_avg_sugar, #[ignore]);
}

// https://core.hash.ai/@hash/published-display-behaviors/2.3.0
run_test!(published_display_behaviors);

// https://core.hash.ai/@hash/boids-3d/6.1.0
mod boids_3d {
    use crate::run_test;

    run_test!(boids_3d, experiment: cohesion_arange);
    run_test!(boids_3d, experiment: agent_count_value);
    run_test!(boids_3d, experiment: sweep_flocks);
}

#![cfg(not(debug_assertions))]

use crate::run_test;

// https://core.hash.ai/@hash/city-infection-model/6.4.2
mod city_infection_model {
    use crate::run_test;

    // Rust behavior is currently not supported
    run_test!(city_infection_model, experiment: infected_linspace, #[ignore]);
    // Rust behavior is currently not supported
    run_test!(city_infection_model, experiment: duration_range_monte_carlo, #[ignore]);
}

// https://core.hash.ai/@hash/sugarscape/7.5.0
mod sugarscape {
    use crate::run_test;

    // optimization experiment is not implemented
    run_test!(sugarscape, experiment: minimize_the_gini_coefficient, #[ignore]);
    // Rust behavior is currently not supported
    run_test!(sugarscape, experiment: initial_sugar_linear_sweep, #[ignore]);
    // Rust behavior is currently not supported
    run_test!(sugarscape, experiment: agent_density_linspace, #[ignore]);
    // optimization experiment is not implemented
    run_test!(sugarscape, experiment: max_avg_sugar, #[ignore]);
}

// https://core.hash.ai/@hash/published-display-behaviors/2.3.0
// Currently bugged:
//   `thread 'tokio-runtime-worker' panicked at 'assertion failed: (offset + length) <= data.len()'`
run_test!(published_display_behaviors, #[ignore]);

// https://core.hash.ai/@hash/boids-3d/6.1.0
mod boids_3d {
    use crate::run_test;

    run_test!(boids_3d, experiment: cohesion_arange);
    run_test!(boids_3d, experiment: agent_count_value);
    run_test!(boids_3d, experiment: sweep_flocks);
}

// https://core.hash.ai/@hash/model-market/4.5.2
mod model_market {
    use crate::run_test;

    // Rust behavior is currently not supported
    run_test!(model_market, experiment: startup_rate, #[ignore]);
    // Rust behavior is currently not supported
    run_test!(model_market, experiment: max_price_arange, #[ignore]);
    // Rust behavior is currently not supported
    run_test!(model_market, experiment: min_price_arange, #[ignore]);
    // Rust behavior is currently not supported
    run_test!(model_market, experiment: max_cost_arange, #[ignore]);
    // Rust behavior is currently not supported
    run_test!(model_market, experiment: min_cost_arange, #[ignore]);
}

// https://core.hash.ai/@hash/wildfires-regrowth/9.8.0
mod wildfire_regrowth {
    use crate::run_test;

    // optimization experiment is not implemented
    run_test!(wildfire_regrowth, experiment: optimal_rates_for_forest_growth, #[ignore]);
    // Rust behavior is currently not supported
    run_test!(wildfire_regrowth, experiment: test_experiment, #[ignore]);
    // Rust behavior is currently not supported
    run_test!(wildfire_regrowth, experiment: lightning_chance_linspace, #[ignore]);
}

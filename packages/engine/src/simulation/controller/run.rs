use std::sync::Arc;

use execution::runner::RunnerError;
use futures::FutureExt;
use simulation_structure::SimulationShortId;
use tokio::time::Duration;

use crate::{
    config::SimRunConfig,
    datastore::store::Store,
    experiment::controller::comms::{sim_status::SimStatusSend, simulation::SimCtlRecv},
    output::SimulationOutputPersistenceRepr,
    simulation::{
        agent_control::AgentControl,
        comms::Comms,
        controller::{
            error::{Error, Result},
            sim_control::SimControl,
        },
        engine::Engine,
        package::run::Packages,
        status::SimStatus,
    },
};

enum LoopControl {
    Continue,
    Stop,
}

// TODO: Sort out error into/from to avoid so many explicit err conversions using to_string
/// The main function for the run of a simulation. The general flow is in two sections as follows:
///
/// # Initialization
/// - Create an uninitialized store (i.e. create the underlying state of the simulation)
/// - Create the underlying simulation engine which
///   - Runs the appropriate init package to initialize Agent state
///   - Creates an empty context by calling the context packages
///   - Initializes the datastore with Agent state and the empty context
/// - Calls the output packages on the initial state
/// - Starts the main loop
///
/// # The Main Loop
/// The repeating top-level logic of a simulation step.
/// - Check if the sim has been told to stop by the Experiment Controller
/// - Tells the simulation engine to take a step [`Engine::next()`]:
///   - Runs Context Packages in parallel
///   - Runs State Packages sequentially
///   - Runs Output packages
/// - Persists Output
/// - Sends an update on the Step result to the Experiment Controller
///
/// [`Engine::next()`]: crate::simulation::engine::Engine::next
pub async fn sim_run<P: SimulationOutputPersistenceRepr>(
    config: Arc<SimRunConfig>,
    comms: Comms,
    packages: Packages,
    mut sim_from_exp: SimCtlRecv,
    mut sims_to_exp: SimStatusSend,
    mut persistence_service: P,
) -> Result<SimulationShortId> {
    let sim_run_id = config.sim.id;
    let max_num_steps = config.sim.max_num_steps;
    tracing::info!(steps = &max_num_steps, "Beginning simulation run");

    let uninitialized_store = Store::new_uninitialized();

    let mut engine = Engine::new(packages, uninitialized_store, comms, config.clone())
        .await
        .map_err(|sim_err| Error::from(sim_err.to_string()))?;

    tracing::trace!("Initialized the engine, running output packages to persist initial state");
    // We also store the initial state in the persistence service
    let initial_output = engine
        .run_output_packages()
        .await
        .map_err(|e| Error::from(e.to_string()))?;
    persistence_service.add_step_output(initial_output).await?;
    let now = std::time::Instant::now();
    let mut steps_taken = 0;
    let mut early_stop = false;
    let mut stop_msg = Vec::new();

    tracing::trace!("Starting main loop");
    'sim_main: loop {
        // Behaviors expect context.step() to give the current step rather than steps_taken
        let current_step = steps_taken + 1;
        tracing::trace!("Current step: {}", current_step);
        if current_step >= max_num_steps {
            break;
        }

        if let LoopControl::Stop = maybe_handle_sim_ctl_msg(&mut sim_from_exp).await? {
            // The experiment controller has signalled to stop
            break;
        }

        // Take a step in the simulation
        let step_result = match engine.next(current_step).await {
            Ok(step_result) => step_result,
            Err(error) => {
                tracing::error!("Got error within the engine step process: {:?}", error);
                // Try to persist before exiting
                let persistence_result = Some(persistence_service.finalize(&config).await?);
                let runner_error = RunnerError {
                    message: Some(format!("{:?}", error)),
                    code: None,
                    line_number: None,
                    file_name: None,
                    details: None,
                    is_warning: false,
                    is_internal: true, // The error is from within the engine step process.
                };
                sims_to_exp
                    .send(
                        SimStatus::error(
                            sim_run_id,
                            steps_taken as isize,
                            runner_error,
                            persistence_result,
                        )
                        .map_err(|err| Error::from(format!("{:?}", err)))?,
                    )
                    .await
                    .map_err(|exp_controller_err| {
                        Error::from(format!(
                            "Experiment controller error: {:?}",
                            exp_controller_err
                        ))
                    })?;
                return Err(Error::from(format!("Simulation error: {:?}", error)));
            }
        };

        // Persist the output
        persistence_service
            .add_step_output(step_result.output)
            .await?;
        if let AgentControl::Stop(msg) = step_result.agent_control {
            early_stop = true;
            stop_msg = msg;
            // Break before `send`, because stop messages (like other messages) are handled at the
            // start of a step, before running behaviors, so the stop message was already sent on
            // the previous step.
            break 'sim_main;
        }

        // TODO: should the SimStatus be current_step here or steps_taken (it is after .next())
        sims_to_exp
            .send(SimStatus::running(config.sim.id, steps_taken as isize))
            .await
            .map_err(|exp_controller_err| {
                Error::from(format!(
                    "Experiment controller error: {:?}",
                    exp_controller_err
                ))
            })?;

        steps_taken += 1;
    }
    let main_loop_dur = now.elapsed().as_millis();

    let now = std::time::Instant::now();
    let persistence_result = persistence_service.finalize(&config).await?;
    sims_to_exp
        .send(
            SimStatus::ended(
                sim_run_id,
                steps_taken as isize,
                early_stop,
                stop_msg,
                persistence_result,
            )
            .map_err(|sim_err| Error::from(format!("Simulation error: {:?}", sim_err)))?,
        )
        .await
        .map_err(|exp_controller_err| {
            Error::from(format!(
                "Experiment controller error: {:?}",
                exp_controller_err
            ))
        })?;
    let persistence_dur = now.elapsed().as_millis();

    tracing::info!(
        "Finished simulation run. Main loop took {} ms. Persistence took: {} ms",
        main_loop_dur,
        persistence_dur
    );

    // Allow experiment main loop to receive statuses.
    tokio::time::sleep(Duration::from_secs(1)).await;
    Ok(config.sim.id)
}

async fn maybe_handle_sim_ctl_msg(sim_from_exp: &mut SimCtlRecv) -> Result<LoopControl> {
    if let Some(Some(control)) = sim_from_exp.recv().now_or_never() {
        match control {
            SimControl::Pause => loop {
                if let Some(control) = sim_from_exp.recv().await {
                    match control {
                        SimControl::Pause => {
                            tracing::warn!("Pausing when already paused");
                        }
                        SimControl::Resume => {
                            break;
                        }
                        SimControl::Stop => return Ok(LoopControl::Stop),
                    }
                } else {
                    tracing::warn!("Experiment runner exited while paused.");
                    return Ok(LoopControl::Stop);
                }
            },
            SimControl::Resume => {
                tracing::warn!("Resuming when not paused");
            }
            SimControl::Stop => return Ok(LoopControl::Stop),
        }
    }
    Ok(LoopControl::Continue)
}

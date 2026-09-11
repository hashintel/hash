/**
 * Optuna's grey for a step whose parameters broke a constraint, everywhere a
 * step is drawn: the steps table's state mark and the objective chart's dots.
 * A raw hex, because the chart hands it to a canvas and the table wraps it as
 * an arbitrary Panda value.
 */
export const INFEASIBLE_COLOR = "#cccccc";

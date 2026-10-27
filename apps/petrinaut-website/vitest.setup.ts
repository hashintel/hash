import { installMatchMediaIfMissing } from "@hashintel/brunch-agent/testing/match-media";

/**
 * Petrinaut's UI entry probes `matchMedia` while its modules load, which jsdom
 * does not implement; every test that renders Petrinaut AI's chat loads it.
 */
installMatchMediaIfMissing();

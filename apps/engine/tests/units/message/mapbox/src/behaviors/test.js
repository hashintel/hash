/**
 * Tests a `mapbox_request` message
 */
const behavior = (state, context) => {
  if (context.step() === 1) {
    const start_lng_lat = [-71.117128, 42.389755];
    const end_lng_lat = [-71.096227, 42.304433];

    const start_string = start_lng_lat[0] + "," + start_lng_lat[1];
    const end_string = end_lng_lat[0] + "," + end_lng_lat[1];

    state.addMessage("mapbox", "mapbox_request", {
      transportation_method: "driving",
      request_route: start_string + ";" + end_string,
    });
  }

  const ms = context.messages();
  if (ms.length > 0) {
    if (ms[0].type === "mapbox_response") {
      state.received = true;
    }
  }
};

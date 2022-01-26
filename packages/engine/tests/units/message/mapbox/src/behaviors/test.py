def behavior(state, context):
    """Tests a `mapbox_request` message"""
    if context.step() == 1:
        start_lng_lat = [-71.117128, 42.389755]
        end_lng_lat = [-71.096227, 42.304433]

        start_string = f"{start_lng_lat[0]},{start_lng_lat[1]}"
        end_string = f"{end_lng_lat[0]},{end_lng_lat[1]}"

        state.add_message("mapbox", "mapbox_request", {
            "transportation_method": "driving",
            "request_route": f"{start_string};{end_string}",
        })

        messages = context.messages()
        if len(messages) > 0:
            if messages[0]["type"] == "mapbox_response":
                state.received = True

const behavior = (state, context) => {
  const { delivery_positions_layout } = context.globals();

  const layout = context.data()[delivery_positions_layout];

  let truck_delivery_pos = {
    arrival: [],
    departure: [],
  };
  let forklift_delivery_pos = {
    unloader: {
      a: {
        delivery_pos: [],
        pickup_pos: [],
      },
    },
    transfer: {
      a: {
        delivery_pos: [],
        pickup_pos: [],
      },
      b: {
        delivery_pos: [],
        pickup_pos: [],
      },
    },
    acceptor: {
      a: {
        delivery_pos: [],
        pickup_pos: [],
      },
    },
    placement: {
      a: {
        delivery_pos: [],
        pickup_pos: [],
      },
      b: {
        delivery_pos: [],
        pickup_pos: [],
      },
    },
    control: {
      a: {
        delivery_pos: [],
        pickup_pos: [],
      },
    },
    loader: {
      a: {
        delivery_pos: [],
        pickup_pos: [],
      },
    },
  };

  layout.forEach((row, pos_y) => {
    row.forEach((col, pos_x) => {
      if (col === "ATPICK") {
        truck_delivery_pos.arrival.push([pos_x, pos_y, 0]);
        forklift_delivery_pos.unloader.a.pickup_pos.push([pos_x, pos_y, 0]);
      }

      if (col === "UDROP") {
        forklift_delivery_pos.unloader.a.delivery_pos.push([pos_x, pos_y, 0]);
        forklift_delivery_pos.acceptor.a.pickup_pos.push([pos_x, pos_y, 0]);
      }

      if (col === "ADROP") {
        forklift_delivery_pos.acceptor.a.delivery_pos.push([pos_x, pos_y, 0]);
        forklift_delivery_pos.transfer.a.pickup_pos.push([pos_x, pos_y, 0]);
      }

      if (col === "TDROP") {
        forklift_delivery_pos.transfer.a.delivery_pos.push([pos_x, pos_y, 0]);
        forklift_delivery_pos.placement.a.pickup_pos.push([pos_x, pos_y, 0]);
      }

      if (col === "SDROP") {
        forklift_delivery_pos.placement.b.delivery_pos.push([pos_x, pos_y, 0]);
        forklift_delivery_pos.control.a.pickup_pos.push([pos_x, pos_y, 0]);
      }

      if (col === "CDROP") {
        forklift_delivery_pos.control.a.delivery_pos.push([pos_x, pos_y, 0]);
        forklift_delivery_pos.transfer.b.pickup_pos.push([pos_x, pos_y, 0]);
      }

      if (col === "LDROP") {
        forklift_delivery_pos.transfer.b.delivery_pos.push([pos_x, pos_y, 0]);
        forklift_delivery_pos.loader.a.pickup_pos.push([pos_x, pos_y, 0]);
      }

      if (col === "DTDROP") {
        forklift_delivery_pos.loader.a.delivery_pos.push([pos_x, pos_y, 0]);
        truck_delivery_pos.departure.push([pos_x, pos_y, 0]);
      }
    });
  });

  state.truck_delivery_positions = truck_delivery_pos;
  state.forklift_delivery_positions = forklift_delivery_pos;
};

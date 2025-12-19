import type { SDCPN } from "../core/types/sdcpn";

export const productionMachines: { title: string; petriNetDefinition: SDCPN } =
  {
    title: "Production Machines",
    petriNetDefinition: {
      places: [
        {
          id: "place__d662407f-c56d-4a96-bcbb-ead785a9c594",
          name: "RawMaterial",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: -165,
          y: -465,
          width: 130,
          height: 130,
        },
        {
          id: "place__2bdd959f-a5bc-404a-bd03-34fafcef66b8",
          name: "AvailableMachines",
          colorId: "type__1762560152725",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: -150,
          y: 75,
          width: 130,
          height: 130,
        },
        {
          id: "place__81e551b4-11dc-4781-9cd7-dd882fd7e947",
          name: "MachinesProducing",
          colorId: "type__1762560154179",
          dynamicsEnabled: true,
          differentialEquationId: "ca26e5e2-0373-46a9-920e-a6eacadd92e8",
          x: 330,
          y: -255,
          width: 130,
          height: 130,
        },
        {
          id: "place__d5f92ae2-c8c4-49cb-935e-4a35e4f7b5fe",
          name: "BadProduct",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 1170,
          y: -270,
          width: 130,
          height: 130,
        },
        {
          id: "place__7b695ff5-a397-4237-8e30-ddf8cbc9e2c4",
          name: "GoodProduct",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 1110,
          y: -450,
          width: 130,
          height: 130,
        },
        {
          id: "place__e5af0410-d80a-4c8b-b3bf-692918b98e6c",
          name: "BrokenMachines",
          colorId: "type__1762560152725",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 1170,
          y: 90,
          width: 130,
          height: 130,
        },
        {
          id: "place__17c65d6e-0c3e-48e6-a677-2914e28131ac",
          name: "MachinesBeingRepaired",
          colorId: "type__1762560152725",
          dynamicsEnabled: true,
          differentialEquationId: "5bfea547-faaf-4626-8662-6400d07c049e",
          x: -585,
          y: 405,
          width: 130,
          height: 130,
        },
        {
          id: "place__4b72cf19-907b-4fc0-ac0a-555453e95d4b",
          name: "TechniciansComing",
          colorId: "type__1762560159263",
          dynamicsEnabled: true,
          differentialEquationId: "887245c3-183c-4dac-a1aa-d602d21b6450",
          x: 855,
          y: 795,
          width: 130,
          height: 130,
        },
        {
          id: "place__eaca89b8-1db1-45fa-8c3a-6eb6f0419ffa",
          name: "AvailableTechnicians",
          colorId: "type__1762560159263",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 1395,
          y: 795,
          width: 130,
          height: 130,
        },
        {
          id: "place__9cb073fb-f1d7-4613-8b10-8d1b08796f24",
          name: "MachinesToRepair",
          colorId: "type__1762560152725",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 1110,
          y: 585,
          width: 130,
          height: 130,
        },
      ],
      transitions: [
        {
          id: "transition__76f23aa1-404a-4696-ac14-5a634af01221",
          name: "Production Success",
          inputArcs: [
            {
              placeId: "place__81e551b4-11dc-4781-9cd7-dd882fd7e947",
              weight: 1,
            },
          ],
          outputArcs: [
            {
              placeId: "place__7b695ff5-a397-4237-8e30-ddf8cbc9e2c4",
              weight: 1,
            },
            {
              placeId: "place__2bdd959f-a5bc-404a-bd03-34fafcef66b8",
              weight: 1,
            },
          ],
          lambdaType: "predicate",
          lambdaCode:
            "export default Lambda((tokens) => {\n  return tokens.MachinesProducing[0].transformation_progress >= 1;\n})",
          transitionKernelCode:
            "/**\n* This function defines the kernel for the transition.\n* It receives tokens from input places,\n* and any global parameters defined,\n* and should return tokens for output places keyed by place name.\n*/\nexport default TransitionKernel((tokensByPlace) => {\n  // tokensByPlace is an object which looks like:\n  //   { PlaceA: [{ x: 0, y: 0 }], PlaceB: [...] }\n  // where 'x' and 'y' are examples of dimensions (properties)\n  // of the token's type.\n\n  // Return an object with output place names as keys\n  return {\n    AvailableMachines: [\n      { machine_damage_ratio: tokensByPlace.MachinesProducing[0].machine_damage_ratio }\n    ],\n  };\n});",
          x: 720,
          y: -285,
          width: 160,
          height: 80,
        },
        {
          id: "transition__b524484d-263e-4065-b8b2-7a8e49529260",
          name: "Machine Fail",
          inputArcs: [
            {
              placeId: "place__81e551b4-11dc-4781-9cd7-dd882fd7e947",
              weight: 1,
            },
          ],
          outputArcs: [
            {
              placeId: "place__d5f92ae2-c8c4-49cb-935e-4a35e4f7b5fe",
              weight: 1,
            },
            {
              placeId: "place__e5af0410-d80a-4c8b-b3bf-692918b98e6c",
              weight: 1,
            },
          ],
          lambdaType: "stochastic",
          lambdaCode:
            "export default Lambda((tokens) => {\n  return tokens.MachinesProducing[0].machine_damage_ratio ** 100;\n})",
          transitionKernelCode:
            "/**\n* This function defines the kernel for the transition.\n* It receives tokens from input places,\n* and any global parameters defined,\n* and should return tokens for output places keyed by place name.\n*/\nexport default TransitionKernel((tokens) => {\n  // tokensByPlace is an object which looks like:\n  //   { PlaceA: [{ x: 0, y: 0 }], PlaceB: [...] }\n  // where 'x' and 'y' are examples of dimensions (properties)\n  // of the token's type.\n\n  // Return an object with output place names as keys\n  return {\n    BrokenMachines: [\n      {\n        machine_damage_ratio: tokens.MachinesProducing[0].machine_damage_ratio\n      }\n    ],\n  };\n});",
          x: 720,
          y: -105,
          width: 160,
          height: 80,
        },
        {
          id: "transition__c4b30ba4-da08-4407-b97b-41e2db5d6879",
          name: "Start Production",
          inputArcs: [
            {
              placeId: "place__d662407f-c56d-4a96-bcbb-ead785a9c594",
              weight: 1,
            },
            {
              placeId: "place__2bdd959f-a5bc-404a-bd03-34fafcef66b8",
              weight: 1,
            },
          ],
          outputArcs: [
            {
              placeId: "place__81e551b4-11dc-4781-9cd7-dd882fd7e947",
              weight: 1,
            },
          ],
          lambdaType: "predicate",
          lambdaCode: "export default Lambda(() => true)",
          transitionKernelCode:
            "/**\n* This function defines the kernel for the transition.\n* It receives tokens from input places,\n* and any global parameters defined,\n* and should return tokens for output places keyed by place name.\n*/\nexport default TransitionKernel((tokensByPlace) => {\n  // tokensByPlace is an object which looks like:\n  //   { PlaceA: [{ x: 0, y: 0 }], PlaceB: [...] }\n  // where 'x' and 'y' are examples of dimensions (properties)\n  // of the token's type.\n\n  // Return an object with output place names as keys\n  return {\n    MachinesProducing: [\n      {\n        machine_damage_ratio: tokensByPlace.AvailableMachines[0].machine_damage_ratio,\n        transformation_progress: 0\n      }\n    ],\n  };\n});",
          x: 90,
          y: -225,
          width: 160,
          height: 80,
        },
        {
          id: "transition__cc61df1f-00f3-456f-8a80-03e8b68f3007",
          name: "Finish Repair",
          inputArcs: [
            {
              placeId: "place__17c65d6e-0c3e-48e6-a677-2914e28131ac",
              weight: 1,
            },
          ],
          outputArcs: [
            {
              placeId: "place__2bdd959f-a5bc-404a-bd03-34fafcef66b8",
              weight: 1,
            },
          ],
          lambdaType: "predicate",
          lambdaCode:
            "export default Lambda((tokens) => {\n  return tokens.MachinesBeingRepaired[0].machine_damage_ratio <= 0;\n})",
          transitionKernelCode:
            "/**\n* This function defines the kernel for the transition.\n* It receives tokens from input places,\n* and any global parameters defined,\n* and should return tokens for output places keyed by place name.\n*/\nexport default TransitionKernel((tokensByPlace, parameters) => {\n  // tokensByPlace is an object which looks like:\n  //   { PlaceA: [{ x: 0, y: 0 }], PlaceB: [...] }\n  // where 'x' and 'y' are examples of dimensions (properties)\n  // of the token's type.\n\n  // Return an object with output place names as keys\n  return {\n    AvailableMachines: [\n      { machine_damage_ratio: 0 }\n    ],\n  };\n});",
          x: -330,
          y: 420,
          width: 160,
          height: 80,
        },
        {
          id: "transition__11f0b21a-d0f2-4bd5-b4c1-d23627f921c5",
          name: "Call Technician",
          inputArcs: [
            {
              placeId: "place__e5af0410-d80a-4c8b-b3bf-692918b98e6c",
              weight: 1,
            },
          ],
          outputArcs: [
            {
              placeId: "place__4b72cf19-907b-4fc0-ac0a-555453e95d4b",
              weight: 1,
            },
            {
              placeId: "place__9cb073fb-f1d7-4613-8b10-8d1b08796f24",
              weight: 1,
            },
          ],
          lambdaType: "predicate",
          lambdaCode: "export default Lambda(() => true)",
          transitionKernelCode:
            "/**\n* This function defines the kernel for the transition.\n* It receives tokens from input places,\n* and any global parameters defined,\n* and should return tokens for output places keyed by place name.\n*/\nexport default TransitionKernel((tokens, parameters) => {\n  // tokensByPlace is an object which looks like:\n  //   { PlaceA: [{ x: 0, y: 0 }], PlaceB: [...] }\n  // where 'x' and 'y' are examples of dimensions (properties)\n  // of the token's type.\n\n  // Return an object with output place names as keys\n  return {\n    MachinesToRepair: tokens.BrokenMachines,\n    TechniciansComing: [\n      { distance_to_site: 10 }\n    ],\n  };\n});",
          x: 570,
          y: 735,
          width: 160,
          height: 80,
        },
        {
          id: "transition__514730c0-7ac5-47d5-8def-91446a248a83",
          name: "Technician Ready",
          inputArcs: [
            {
              placeId: "place__4b72cf19-907b-4fc0-ac0a-555453e95d4b",
              weight: 1,
            },
          ],
          outputArcs: [
            {
              placeId: "place__eaca89b8-1db1-45fa-8c3a-6eb6f0419ffa",
              weight: 1,
            },
          ],
          lambdaType: "predicate",
          lambdaCode:
            "export default Lambda((tokens) => {\n  return tokens.TechniciansComing[0].distance_to_site <= 0;\n})",
          transitionKernelCode:
            "/**\n* This function defines the kernel for the transition.\n* It receives tokens from input places,\n* and any global parameters defined,\n* and should return tokens for output places keyed by place name.\n*/\nexport default TransitionKernel((tokensByPlace, parameters) => {\n  // tokensByPlace is an object which looks like:\n  //   { PlaceA: [{ x: 0, y: 0 }], PlaceB: [...] }\n  // where 'x' and 'y' are examples of dimensions (properties)\n  // of the token's type.\n\n  // Return an object with output place names as keys\n  return {\n    AvailableTechnicians: [\n      { distance_to_site: 0 }\n    ],\n  };\n});",
          x: 1110,
          y: 825,
          width: 160,
          height: 80,
        },
        {
          id: "transition__0efcd1bf-b1ff-466f-8a8f-c329ddce0ce8",
          name: "Start Repair",
          inputArcs: [
            {
              placeId: "place__eaca89b8-1db1-45fa-8c3a-6eb6f0419ffa",
              weight: 1,
            },
            {
              placeId: "place__9cb073fb-f1d7-4613-8b10-8d1b08796f24",
              weight: 1,
            },
          ],
          outputArcs: [
            {
              placeId: "place__17c65d6e-0c3e-48e6-a677-2914e28131ac",
              weight: 1,
            },
          ],
          lambdaType: "predicate",
          lambdaCode: "export default Lambda(() => true)",
          transitionKernelCode:
            "/**\n* This function defines the kernel for the transition.\n* It receives tokens from input places,\n* and any global parameters defined,\n* and should return tokens for output places keyed by place name.\n*/\nexport default TransitionKernel((tokens) => {\n  // tokens is an object which looks like:\n  //   { PlaceA: [{ x: 0, y: 0 }], PlaceB: [...] }\n  // where 'x' and 'y' are examples of dimensions (properties)\n  // of the token's type.\n\n  // Return an object with output place names as keys\n  return {\n    MachinesBeingRepaired: [\n      { machine_damage_ratio: tokens.BrokenMachines[0].machine_damage_ratio }\n    ],\n  };\n});",
          x: 1635,
          y: 480,
          width: 160,
          height: 80,
        },
      ],
      types: [
        {
          id: "type__1762560152725",
          name: "Machine",
          iconSlug: "circle",
          displayColor: "#3b82f6",
          elements: [
            {
              elementId: "element__1762560152725_3",
              name: "machine_damage_ratio",
              type: "real",
            },
          ],
        },
        {
          id: "type__1762560154179",
          name: "Machine Producing Product",
          iconSlug: "circle",
          displayColor: "#733bf6ff",
          elements: [
            {
              elementId: "element__1762560154179_2",
              name: "machine_damage_ratio",
              type: "real",
            },
            {
              elementId: "element__1762560154179_3",
              name: "transformation_progress",
              type: "real",
            },
          ],
        },
        {
          id: "type__1762560159263",
          name: "Technician",
          iconSlug: "circle",
          displayColor: "#3bf689ff",
          elements: [
            {
              elementId: "element__1762560159263_2",
              name: "distance_to_site",
              type: "real",
            },
          ],
        },
      ],
      differentialEquations: [
        {
          id: "5bfea547-faaf-4626-8662-6400d07c049e",
          name: "Reparation Dynamics",
          colorId: "type__1762560152725",
          code: '// This function defines the differential equation for the place of type "Machine".\n// The function receives the current tokens in all places and the parameters.\n// It should return the derivative of the token value in this place.\nexport default Dynamics((tokens, parameters) => {\n  return tokens.map(({ machine_damage_ratio }) => {\n    // ...Do some computation with input token here if needed\n\n    return {\n      machine_damage_ratio: -1 / 3\n    };\n  });\n});',
        },
        {
          id: "ca26e5e2-0373-46a9-920e-a6eacadd92e8",
          name: "Production Dynamics",
          colorId: "type__1762560154179",
          code: '// This function defines the differential equation for the place of type "Machine Producing Product".\n// The function receives the current tokens in all places and the parameters.\n// It should return the derivative of the token value in this place.\nexport default Dynamics((tokens, parameters) => {\n  return tokens.map(({ machine_damage_ratio, transformation_progress }) => {\n    // ...Do some computation with input token here if needed\n\n    return {\n      machine_damage_ratio: 1 / 1000,\n      transformation_progress: 1 / 3\n    };\n  });\n});',
        },
        {
          id: "887245c3-183c-4dac-a1aa-d602d21b6450",
          name: "Technician Travel Dynamics",
          colorId: "type__1762560159263",
          code: '// This function defines the differential equation for the place of type "Technician".\n// The function receives the current tokens in all places and the parameters.\n// It should return the derivative of the token value in this place.\nexport default Dynamics((tokens, parameters) => {\n  return tokens.map(({ distance_to_site }) => {\n    // ...Do some computation with input token here if needed\n\n    return {\n      distance_to_site: -1\n    };\n  });\n});',
        },
      ],
      parameters: [],
    },
  };

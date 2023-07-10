import { assign } from "min-dash";

/**
 * A palette provider for BPMN 2.0 elements.
 *
 * HASH: We import this file to overwrite the events in `assign` with our desired options.
 */
export default function PaletteProvider(
  palette,
  create,
  elementFactory,
  spaceTool,
  lassoTool,
  handTool,
  globalConnect,
  translate,
) {
  this._palette = palette;
  this._create = create;
  this._elementFactory = elementFactory;
  this._spaceTool = spaceTool;
  this._lassoTool = lassoTool;
  this._handTool = handTool;
  this._globalConnect = globalConnect;
  this._translate = translate;

  palette.registerProvider(this);
}

PaletteProvider.$inject = [
  "palette",
  "create",
  "elementFactory",
  "spaceTool",
  "lassoTool",
  "handTool",
  "globalConnect",
  "translate",
];

PaletteProvider.prototype.getPaletteEntries = function (element) {
  var actions = {},
    create = this._create,
    elementFactory = this._elementFactory,
    spaceTool = this._spaceTool,
    lassoTool = this._lassoTool,
    handTool = this._handTool,
    globalConnect = this._globalConnect,
    translate = this._translate;

  function createAction(type, group, className, title, options) {
    function createListener(event) {
      var shape = elementFactory.createShape(assign({ type: type }, options));

      if (options) {
        shape.businessObject.di.isExpanded = options.isExpanded;
      }

      create.start(event, shape);
    }

    var shortType = type.replace(/^bpmn:/, "");

    return {
      group: group,
      className: className,
      title: title || translate("Create {type}", { type: shortType }),
      action: {
        dragstart: createListener,
        click: createListener,
      },
    };
  }

  function createSubprocess(event) {
    var subProcess = elementFactory.createShape({
      type: "bpmn:SubProcess",
      x: 0,
      y: 0,
      isExpanded: true,
    });

    var startEvent = elementFactory.createShape({
      type: "bpmn:StartEvent",
      x: 40,
      y: 82,
      parent: subProcess,
    });

    create.start(event, [subProcess, startEvent], {
      hints: {
        autoSelect: [startEvent],
      },
    });
  }

  function createParticipant(event) {
    create.start(event, elementFactory.createParticipantShape());
  }

  assign(actions, {
    "hand-tool": {
      group: "tools",
      className: "bpmn-icon-hand-tool",
      title: translate("Activate the hand tool"),
      action: {
        click: function (event) {
          handTool.activateHand(event);
        },
      },
    },
    "lasso-tool": {
      group: "tools",
      className: "bpmn-icon-lasso-tool",
      title: translate("Activate the lasso tool"),
      action: {
        click: function (event) {
          lassoTool.activateSelection(event);
        },
      },
    },
    "space-tool": {
      group: "tools",
      className: "bpmn-icon-space-tool",
      title: translate("Activate the create/remove space tool"),
      action: {
        click: function (event) {
          spaceTool.activateSelection(event);
        },
      },
    },
    "global-connect-tool": {
      group: "tools",
      className: "bpmn-icon-connection-multi",
      title: translate("Activate the global connect tool"),
      action: {
        click: function (event) {
          globalConnect.start(event);
        },
      },
    },
    "tool-separator": {
      group: "tools",
      separator: true,
    },
    "create.start-event": createAction(
      "bpmn:StartEvent",
      "event",
      "bpmn-icon-start-event-none",
      translate("Create Source Block"),
    ),
    "create.exclusive-gateway": createAction(
      "bpmn:ExclusiveGateway",
      "gateway",
      "bpmn-icon-gateway-none",
      translate("Create Select Output Block"),
    ),
    "create.service-task": createAction(
      "bpmn:ServiceTask",
      "activity",
      "bpmn-icon-service",
      translate("Create Service Block"),
    ),
    "create.custom-task": createAction(
      "bpmn:ScriptTask",
      "activity",
      "bpmn-icon-script",
      translate("Create Custom Block"),
    ),
    "create.timer-intermediate-event": createAction(
      "bpmn:IntermediateCatchEvent",
      "event",
      "bpmn-icon-intermediate-event-catch-timer",
      translate("Create Delay Block"),
      {
        eventDefinitionType: "bpmn:TimerEventDefinition",
      },
    ),
    "create.message-intermediate-catch-event": createAction(
      "bpmn:IntermediateCatchEvent",
      "event",
      "bpmn-icon-intermediate-event-catch-message",
      translate("Create Seize Block"),
      {
        eventDefinitionType: "bpmn:MessageEventDefinition",
      },
    ),
    "create.message-intermediate-throw-event": createAction(
      "bpmn:IntermediateThrowEvent",
      "event",
      "bpmn-icon-intermediate-event-throw-message",
      translate("Create Release Block"),
      {
        eventDefinitionType: "bpmn:MessageEventDefinition",
      },
    ),
    "create.link-intermediate-catch-event": createAction(
      "bpmn:IntermediateCatchEvent",
      "event",
      "bpmn-icon-intermediate-event-catch-link",
      translate("Create Enter Block"),
      {
        eventDefinitionType: "bpmn:LinkEventDefinition",
      },
    ),
    "create.link-intermediate-throw-event": createAction(
      "bpmn:IntermediateThrowEvent",
      "event",
      "bpmn-icon-intermediate-event-throw-link",
      translate("Create Exit Block"),
      {
        eventDefinitionType: "bpmn:LinkEventDefinition",
      },
    ),
    "create.end-event": createAction(
      "bpmn:EndEvent",
      "event",
      "bpmn-icon-end-event-none",
      translate("Create Sink Block"),
    ),
  });

  return actions;
};

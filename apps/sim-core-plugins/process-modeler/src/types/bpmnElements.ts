export type BpmnElement = {
  businessObject: ElementBusinessObject;
  height: number;
  id: string;
  incoming: Connection[];
  outgoing: Connection[];
  type: ElementType | "label";
  width: number;
  x: number;
  y: number;
};

type ElementBusinessObject = {
  eventDefinitions?: EventDefinition[];
  get: (property: string) => any;
  name?: string;
  $type: ElementType;
};

type ElementType =
  | "bpmn:EndEvent"
  | "bpmn:ExclusiveGateway"
  | "bpmn:IntermediateCatchEvent"
  | "bpmn:IntermediateThrowEvent"
  | "bpmn:Process"
  | "bpmn:ScriptTask"
  | "bpmn:SequenceFlow"
  | "bpmn:ServiceTask"
  | "bpmn:StartEvent";

type EventDefinitionType =
  | "bpmn:LinkEventDefinition"
  | "bpmn:MessageEventDefinition"
  | "bpmn:TimerEventDefinition";

type EventDefinition = {
  $type: EventDefinitionType;
  id: string;
};

export type Root = BpmnElement & { type: "bpmn:Process" };
export const isRoot = (element: BpmnElement): element is Root =>
  element.type === "bpmn:Process";

export type Custom = BpmnElement & { type: "bpmn:ScriptTask" };
export const isCustom = (element: BpmnElement): element is Custom =>
  element.type === "bpmn:ScriptTask";

export type Source = BpmnElement & { type: "bpmn:StartEvent" };
export const isSource = (element: BpmnElement): element is Source =>
  element.type === "bpmn:StartEvent";

export type Delay = BpmnElement & {
  type: "bpmn:IntermediateCatchEvent";
  businessObject: ElementBusinessObject & {
    eventDefinitions: [
      {
        $type: "bpmn:TimerEventDefinition";
        id: string;
      },
    ];
  };
};
export const isDelay = (element: BpmnElement): element is Delay =>
  element.type !== "label" &&
  element.businessObject.eventDefinitions?.[0]?.$type ===
    "bpmn:TimerEventDefinition";

export type Seize = BpmnElement & {
  type: "bpmn:IntermediateCatchEvent";
  businessObject: ElementBusinessObject & {
    eventDefinitions: [
      {
        $type: "bpmn:MessageEventDefinition";
        id: string;
      },
    ];
  };
};
export const isSeize = (element: BpmnElement): element is Delay =>
  element.type === "bpmn:IntermediateCatchEvent" &&
  element.businessObject.eventDefinitions?.[0]?.$type ===
    "bpmn:MessageEventDefinition";

export type Release = BpmnElement & {
  type: "bpmn:IntermediateThrowEvent";
  businessObject: ElementBusinessObject & {
    eventDefinitions: [
      {
        $type: "bpmn:MessageEventDefinition";
        id: string;
      },
    ];
  };
};
export const isRelease = (element: BpmnElement): element is Delay =>
  element.type === "bpmn:IntermediateThrowEvent" &&
  element.businessObject.eventDefinitions?.[0]?.$type ===
    "bpmn:MessageEventDefinition";

export type Enter = BpmnElement & {
  type: "bpmn:IntermediateCatchEvent";
  businessObject: ElementBusinessObject & {
    eventDefinitions: [
      {
        $type: "bpmn:LinkEventDefinition";
        id: string;
      },
    ];
  };
};
export const isEnter = (element: BpmnElement): element is Delay =>
  element.type === "bpmn:IntermediateCatchEvent" &&
  element.businessObject.eventDefinitions?.[0]?.$type ===
    "bpmn:LinkEventDefinition";

export type Exit = BpmnElement & {
  type: "bpmn:IntermediateThrowEvent";
  businessObject: ElementBusinessObject & {
    eventDefinitions: [
      {
        $type: "bpmn:LinkEventDefinition";
        id: string;
      },
    ];
  };
};
export const isExit = (element: BpmnElement): element is Delay =>
  element.type === "bpmn:IntermediateThrowEvent" &&
  element.businessObject.eventDefinitions?.[0]?.$type ===
    "bpmn:LinkEventDefinition";

export type Gateway = BpmnElement & { type: "bpmn:ExclusiveGateway" };
export const isGateway = (element: BpmnElement): element is Gateway =>
  element.type === "bpmn:ExclusiveGateway";

export type MessageSink = BpmnElement & {
  type: "bpmn:EndEvent";
  businessObject: ElementBusinessObject & {
    eventDefinitions: [
      {
        $type: "bpmn:MessageEventDefinition";
        id: string;
      },
    ];
  };
};
export const isMessageSink = (element: BpmnElement): element is MessageSink =>
  element.type !== "label" &&
  element.businessObject.eventDefinitions?.[0]?.$type ===
    "bpmn:MessageEventDefinition";

export type Sink = BpmnElement & { type: "bpmn:EndEvent" };
export const isSink = (element: BpmnElement): element is Connection =>
  element.type === "bpmn:EndEvent";

export type Service = BpmnElement & { type: "bpmn:ServiceTask" };
export const isService = (element: BpmnElement): element is Service =>
  element.type === "bpmn:ServiceTask";

export type Connection = BpmnElement & {
  type: "bpmn:SequenceFlow";
  businessObject: ElementBusinessObject & {
    sourceRef: ElementBusinessObject;
    targetRef: ElementBusinessObject;
  };
};
export const isConnection = (element: BpmnElement): element is Connection =>
  element.type === "bpmn:SequenceFlow";

export type ElementTypeName =
  | "custom"
  | "source"
  | "seize"
  | "release"
  | "service"
  | "delay"
  | "root"
  | "sink"
  | "enter"
  | "exit"
  | "select_output";

export const elementType = (
  element: BpmnElement,
): ElementTypeName | undefined => {
  if (isRoot(element)) {
    return "root";
  }
  if (isCustom(element)) {
    return "custom";
  }
  if (isSource(element)) {
    return "source";
  }
  if (isSeize(element)) {
    return "seize";
  }
  if (isRelease(element)) {
    return "release";
  }
  if (isService(element)) {
    return "service";
  }
  if (isDelay(element)) {
    return "delay";
  }
  if (isSink(element)) {
    return "sink";
  }
  if (isEnter(element)) {
    return "enter";
  }
  if (isExit(element)) {
    return "exit";
  }
  if (isGateway(element)) {
    return "select_output";
  }
};

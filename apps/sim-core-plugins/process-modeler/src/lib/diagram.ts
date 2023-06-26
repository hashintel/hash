export const diagramStarterString = `
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_0xcv3nk" targetNamespace="http://bpmn.io/schema/bpmn" exporter="Camunda Modeler" exporterVersion="3.0.0-dev">
  <bpmn:process id="Process_0sckl64" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="start" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_0sckl64">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="159" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;

export const diagramPremadeString = `
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_0xcv3nk" targetNamespace="http://bpmn.io/schema/bpmn" exporter="Camunda Modeler" exporterVersion="3.0.0-dev">
  <bpmn:process id="Process_0sckl64" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="start">
      <bpmn:outgoing>Flow_1qee3nj</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:intermediateCatchEvent id="Event_1e7i83l" name="delay">
      <bpmn:incoming>Flow_0k2aou7</bpmn:incoming>
      <bpmn:outgoing>Flow_121n3hb</bpmn:outgoing>
      <bpmn:timerEventDefinition id="TimerEventDefinition_1lr1unr" />
    </bpmn:intermediateCatchEvent>
    <bpmn:exclusiveGateway id="Gateway_1l1g6ax" name="selection">
      <bpmn:incoming>Flow_1qee3nj</bpmn:incoming>
      <bpmn:outgoing>Flow_0k2aou7</bpmn:outgoing>
      <bpmn:outgoing>Flow_1m8y22q</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:endEvent id="Event_1f4oq05" name="end">
      <bpmn:incoming>Flow_121n3hb</bpmn:incoming>
      <bpmn:incoming>Flow_1m8y22q</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1qee3nj" sourceRef="StartEvent_1" targetRef="Gateway_1l1g6ax" />
    <bpmn:sequenceFlow id="Flow_0k2aou7" sourceRef="Gateway_1l1g6ax" targetRef="Event_1e7i83l" />
    <bpmn:sequenceFlow id="Flow_121n3hb" sourceRef="Event_1e7i83l" targetRef="Event_1f4oq05" />
    <bpmn:sequenceFlow id="Flow_1m8y22q" sourceRef="Gateway_1l1g6ax" targetRef="Event_1f4oq05" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_0sckl64">
      <bpmndi:BPMNEdge id="Flow_1qee3nj_di" bpmnElement="Flow_1qee3nj">
        <di:waypoint x="215" y="177" />
        <di:waypoint x="285" y="177" />
        <di:waypoint x="285" y="190" />
        <di:waypoint x="355" y="190" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0k2aou7_di" bpmnElement="Flow_0k2aou7">
        <di:waypoint x="380" y="165" />
        <di:waypoint x="380" y="90" />
        <di:waypoint x="502" y="90" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_121n3hb_di" bpmnElement="Flow_121n3hb">
        <di:waypoint x="538" y="90" />
        <di:waypoint x="575" y="90" />
        <di:waypoint x="575" y="190" />
        <di:waypoint x="612" y="190" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1m8y22q_di" bpmnElement="Flow_1m8y22q">
        <di:waypoint x="405" y="190" />
        <di:waypoint x="612" y="190" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="159" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="186" y="195" width="22" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1l1g6ax_di" bpmnElement="Gateway_1l1g6ax" isMarkerVisible="true">
        <dc:Bounds x="355" y="165" width="50" height="50" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="358" y="222" width="44" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_1e7i83l_di" bpmnElement="Event_1e7i83l">
        <dc:Bounds x="502" y="72" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="507" y="115" width="27" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_1f4oq05_di" bpmnElement="Event_1f4oq05">
        <dc:Bounds x="612" y="172" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="621" y="215" width="19" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;

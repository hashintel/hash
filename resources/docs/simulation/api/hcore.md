# hCore Message API

hCore provides a messaging protocol API for embedded instances of hCore. You can use the messaging API to edit and set a simulation files and to read the state of a simulation.

All hCore messages use the [postMessage technique for messaging between iFrames](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage). 

```javascript
//example

<iframe>.contentWindow.postMessage({
  id: <unique id, string>,
  type: <message type, string
 },
 "*"
);
```

{% hint style="info" %}
See the hCore Messaging API in action in the [Create a Simulation Dashboard tutorial](../tutorials/create-a-simulation-dashboard.md).
{% endhint %}

## updateFile

Update the contents of a simulation file to the contents defined in the message payload.

{% code title="updateFile message example" %}
```javascript
{
  "id": "1625b2ce-441f-4b42-8d44-80ec3bae2495",
  "type": "updateFile",
  "file": "globals.json",
  //stringify the contents and HASH will auto decode.
  "contents": JSON.stringify({"foo": 1})
 }
```
{% endcode %}

## sendState

Request the current state of the simulation. Will return the full state as a dictionary where the key is the time step and the value an array of agent objects.

{% tabs %}
{% tab title="Message" %}
{% code title="sendState message example" %}
```javascript
{
 "id": "1625b2ce-441f-4b42-8d44-80ec3bae2495",
 "type": "sendState"
}
```
{% endcode %}
{% endtab %}

{% tab title="Response" %}
```
{ type: 'state',
  contents: 
   { steps: { 0: [Array], 1: [Array] },
     stepsCount: 2,
     simulationRunId: 'eb42f23b-b6b2-4fd2-89ea-5e8fd9e61e9e',
     startedTime: 1622587139503,
     plots: null,
     experimentId: null,
     status: 'queued',
     mode: 'computeAndPlayback',
     presentingSpeed: 'live',
     presenting: false,
     scrubbedStep: null,
     owedSteps: 0 } 
 }
```
{% endtab %}
{% endtabs %}

## initialize

Request that HASH send a message every time a file or the state changes.

{% tabs %}
{% tab title="Message" %}
{% code title="initialize message example" %}
```javascript
{
 "id": "1625b2ce-441f-4b42-8d44-80ec3bae2495",
 "type": "initialize"
}
```
{% endcode %}
{% endtab %}
{% endtabs %}

## resetAndRun

Trigger HASH to reset the simulation and generate a new simulation run.

{% tabs %}
{% tab title="Message" %}
{% code title="resetAndRun message example" %}
```javascript
{
 "id": "1625b2ce-441f-4b42-8d44-80ec3bae2495",
 "type": "resetAndRun"
}
```
{% endcode %}
{% endtab %}
{% endtabs %}






# hCore Message API

hCore provides a messaging API for embedded instances of hCore. You can use the messaging API to edit and set a simulation files and to read the state of a simulation. We'd love your [feedback](https://hash.ai/contact) on this feature.

{% hint style="info" %}
See the hCore Messaging API in action in the [Create a Simulation Dashboard tutorial](../tutorials/create-a-simulation-dashboard.md).
{% endhint %}

All hCore messages use the [postMessage technique for messaging between iFrames](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage).  In order to send a message, create a webpage which loads hCore in an iframe, and then send a message to that iframe.

```javascript
//example

<iframe>.contentWindow.postMessage({
  id: <unique id, string>,
  type: <message type, string>
 },
 "*"
);
```

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

Request the current state of the simulation. Will return a message with `type: "state"` and the full state as a dictionary under `contents`, where the key is the time step and the value an array of agent objects.

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

Request that HASH send a message every time a file changes. If you send this to a framed hCore, it will send a message with `type: "files"` and `content: file[]` every time changes are made to a source file.

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

Trigger hCore to reset the simulation, generate a new simulation run, and start it playing.

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






# Plots Syntax Reference

## Histograms

**Vertical histogram**

{% tabs %}
{% tab title="Code" %}
```javascript
{
  "title": "My histogram",
  "type": "histogram",
  "data": [{"x": "BlueTeamMetric", "name": "BlueTeamMetric"}],
  "layout": {"width": "100%", "height": "100%"},
  "position": {"x": "0%", "y": "0%"}
}
```
{% endtab %}

{% tab title="Modal configuration" %}
![](../../../.gitbook/assets/screenshot-2021-03-11-at-18.27.36.png)
{% endtab %}
{% endtabs %}

**Horizontal histogram**

{% tabs %}
{% tab title="Code" %}
```javascript
{
  "title": "My horizontal histogram",
  "type": "histogram",
  "data": [{"y": "BlueTeamMetric", "name": "BlueTeamMetric"}],
  "layout": {"width": "100%", "height": "100%"},
  "position": {"x": "0%", "y": "0%"}
}
```
{% endtab %}

{% tab title="Modal configuration" %}
![](../../../.gitbook/assets/screenshot-2021-03-11-at-18.30.43.png)
{% endtab %}
{% endtabs %}

**Two histograms on the same plot**

{% tabs %}
{% tab title="Code" %}
```javascript
{
  "title": "Two histograms on the same plot",
  "type": "histogram",
  "data": [{"x": "BlueTeamMetric" },{"x": "OrangeTeamMetric" }],
  "layout": {"width": "100%", "height": "100%"},
  "position": {"x": "0%", "y": "0%"}
}
```
{% endtab %}

{% tab title="Modal configuration" %}
![](../../../.gitbook/assets/screenshot-2021-03-11-at-18.36.34.png)
{% endtab %}
{% endtabs %}

**Two horizontal histograms on the same plot**

{% tabs %}
{% tab title="Code" %}
```javascript
{
  "title": "Two horizontal histograms on the same plot",
  "type": "histogram",
  "data": [
    {"y": "BlueTeamMetric", "name": "BlueTeamMetric"},
    {"y": "OrangeTeamMetric", "name": "OrangeTeamMetric"}
  ],
  "layout": {"width": "100%", "height": "50%"},
  "position": {"x": "0%", "y": "150%"}
}
```
{% endtab %}

{% tab title="Modal configuration" %}
![](../../../.gitbook/assets/screenshot-2021-03-11-at-18.37.23.png)
{% endtab %}
{% endtabs %}

## Area

**Multiple metrics**

{% tabs %}
{% tab title="Code" %}
```javascript
{
  "title": "Infection Progress",
  "type": "area",
  "data": [
    {"y": "exposed", "stackgroup": "one", "name": "exposed"},
    {"y": "infected", "stackgroup": "one", "name": "infected"},
    {"y": "deceased", "stackgroup": "one", "name": "deceased"},
    {"y": "healthy", "stackgroup": "one", "name": "healthy"},
    {"y": "immune", "stackgroup": "one", "name": "immune"}
  ],
  "layout": {"width": "100%", "height": "200%"},
  "position": {"x": "0%", "y": "0%"}
}
```
{% endtab %}

{% tab title="Modal configuration" %}
![](../../../.gitbook/assets/screenshot-2021-03-11-at-17.53.05.png)
{% endtab %}
{% endtabs %}

## Box

**Two box plots example**

{% tabs %}
{% tab title="Code" %}
```javascript
{
    "title": "Two box plots example",
    "layout": {
        "width": "100%",
        "height": "100%"
    },
    "position": {
        "x": "0%",
        "y": "0%"
    },
    "type": "box",
    "data": [{
            "y": "BlueTeamMetric"
        },
        {
            "y": "OrangeTeamMetric"
        }
    ]
}
```
{% endtab %}

{% tab title="Modal configuration" %}
![](../../../.gitbook/assets/screenshot-2021-03-11-at-18.25.23.png)
{% endtab %}
{% endtabs %}

## Line

**Two time-series in the same plot**

{% tabs %}
{% tab title="Code" %}
```javascript
{
    "title": "Two timeseries example",
    "layout": {
        "width": "100%",
        "height": "100%"
    },
    "position": {
        "x": "0%",
        "y": "0%"
    },
    "type": "line",
    "data": [{
        "y": "BlueTeamMetric",
        "name": "Blue team"
    },{
        "y": "OrangeTeamMetric",
        "name": "Orange team"
    }]
}
```
{% endtab %}

{% tab title="Modal configuration" %}
![](../../../.gitbook/assets/screenshot-2021-03-11-at-15.27.25.png)
{% endtab %}
{% endtabs %}

## Scatter

### **Two time-series in the same plot**

{% tabs %}
{% tab title="Code" %}
```javascript
{
    "title": "Two timeseries example",
    "layout": {
        "width": "100%",
        "height": "100%"
    },
    "position": {
        "x": "0%",
        "y": "0%"
    },
    "type": "scatter",
    "data": [{
        "y": "BlueTeamMetric",
        "name": "Blue team"
    },{
        "y": "OrangeTeamMetric",
        "name": "Orange team"
    }]
}
```
{% endtab %}

{% tab title="Modal configuration" %}
![](../../../.gitbook/assets/screenshot-2021-03-11-at-15.15.03.png)
{% endtab %}
{% endtabs %}


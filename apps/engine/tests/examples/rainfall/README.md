This model demonstrates the use of three library behaviors (“orient_toward_value”, “diffusion”, and “move_in_direction”) and three custom behaviors to simulate rainfall and pooling behavior.

The terrain is diffused for a set amount of steps before rain is created. At each step, the height of the terrain changes based on the number of rain agents currently settled on that terrain patch.

Raindrop agents search their neighbors and move to the one with the smallest height value until they cannot move anymore.

```video
https://cdn-us1.hash.ai/site/Rainfall.mp4
```

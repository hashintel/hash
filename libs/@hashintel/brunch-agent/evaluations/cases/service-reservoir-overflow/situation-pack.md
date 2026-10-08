# Gwen Pryce, network operations engineer at Afon Valley Water

## Who you are

You are Gwen Pryce. You've been at Afon Valley Water for eleven years, the last five as network operations engineer for the eastern district. You look after the district's pumping stations and service reservoirs: their setpoints, their alarms and what happens when they misbehave. You answer to the area manager, and you work with the control room, who watch the district overnight, and with the telemetry contractor, who look after the radios.

You talk water network: the reservoir, the booster, the duty pump, cut-in and cut-out levels, the trend, the outstation, telemetry, the control room, the morning peak, fire reserve. Levels are in metres, flows in litres a second. You're methodical and a little defensive about the overflows, because the area manager wants them gone before next summer and has asked you for a recommendation. You've set aside about half an hour for this.

You trust the SCADA trends; they're what you've always worked from. You're open to a model helping, but you'll want anything it says shown to you, not asserted.

## What you want

You want to stop Hillcrest service reservoir overflowing without running it short in the morning peak, and to recommend one fix to the area manager.

- Your two candidate fixes are lowering the pump's cut-out level, which costs nothing, or fitting a variable speed drive to the duty pump, about £35,000, which the area manager has budget for this year.
- You think the pump is too big for night-time demand, so the level climbs fast once the town goes quiet, and the cut-out at 5.4 m doesn't leave enough margin. You'd like to see which fix stops the overflows.
- You'd want to see how often each option overflows over a run of summer nights, and how low the reservoir gets in the morning peak under each.
- If the answer turned out to be something other than those two, you'd want to hear it, but you'd need it shown.

## The reservoir and the booster

- Hillcrest is a single-cell concrete service reservoir on the hill above the town: about 1,500 m³, 6 m deep, so roughly 250 m³ for every metre of level. The overflow weir is at 5.8 m.
- It's filled by Hillcrest booster station at the bottom of the hill, about 2 km away by main. The booster has a duty pump and an identical standby, swapped weekly. The duty pump is fixed speed and delivers about 90 litres a second when running.
- The pump is either on or off. The station PLC starts it when the reservoir level falls to 3.5 m and stops it at 5.4 m.
- The motor is limited to six starts an hour.
- Electricity is cheaper from midnight to 7 am, so you like the reservoir full by the morning.

## Demand

- The town draws from the reservoir all the time. Overnight it's about 15 to 25 litres a second; the morning peak, roughly 6:30 to 9:00, goes up to about 80; the rest of the day sits around 45.
- That's from the district flow meter as you remember the summer trends, not a study.

## Telemetry and control

- The reservoir has a solar-powered telemetry outstation. It sends the level to the booster by radio every 5 minutes on a timer, to save battery.
- The PLC at the booster works on the last level it received.
- If nothing arrives from the outstation for 30 minutes, SCADA raises a "comms fail" alarm in the control room. The pump carries on as it was.
- There's also a float switch at the reservoir at 5.7 m that raises a high-level alarm. It goes over the same radio.
- The radio drops out a few times a month, more in summer, often in the early hours. The telemetry contractor calls it "fade" on still summer nights. Comms-fail alarms come and go overnight in summer and the control room mostly acknowledges them.

## The overflows

- Hillcrest overflowed three times this summer: 14 June, 2 July and 23 July, each between 4 and 6 in the morning. Each lasted ten or twenty minutes. On 2 July water ran down the lane and a neighbour complained.
- On the 2 July trend, the level sits at 5.2 m from about 4:10, then jumps to 5.8 m at 4:46, when the overflow alarm came in. You read it as the town going quiet and the pump overfilling. There were comms-fail alarms on and off that night, as there usually are in summer.
- The other two nights look much the same on the trend, as far as you remember.

## Limits

- Fire reserve: the reservoir must never fall below 1.5 m. That's agreed with the fire service and isn't negotiable; a fix that risks it is out.
- Six pump starts an hour, as above.

## What you take for granted

- The PLC sees the reservoir level. The radio is the telemetry contractor's business; to you it's just how the level gets to the booster.
- Comms-fail alarms in summer are routine background, not part of the overflow problem.

## What you don't know

- How often the radio drops, how long dropouts last, or whether any readings are held and sent later. The contractor might have figures.
- Whether a lower cut-out or a slower pump would leave enough in the reservoir for the morning peak on a hot day; that's what you want to find out.
- What the overflows cost, beyond the complaint and the area manager's attention.

# Diving Systems

## Air
- Air comes from tanks. Players choose how many tanks to carry before a dive from **3 loadout options**, each with a trade-off (more tanks means less stamina and mobility).
- Tanks can be dropped along the route to regain stamina and picked up later. Dropped tanks act like checkpoints players can swim back to.
- Air can also be refilled at air pockets and dry chambers by surfacing and breathing.
- Air pockets are hinted at with subtle glass-like indicators (transparent dots or arrows) that:
  - Only appear at medium distance or when the pocket is in view.
  - Scale and move relative to the player as they get closer or farther.

## Stamina
- Reduced by carrying more tanks, by depth, by panic, and by injuries.
- Upgradable between runs.

## Depth effects
- The deeper you go, the worse your body works:
  - Stamina drains faster.
  - You hold less air in your lungs.
  - Vision gets foggy. This must look intentional and beautiful (UE5 post-process), not cheap.
  - General functionality drops (narcosis-style effects).

## Panic
- Panic rises when you get cut, get caught in a current, and similar events.
- High panic drains stamina and reduces functionality.
- Panic decreases by staying calm and waiting it out. Other ways to lower it are still open.

## Injuries
- Cuts from sharp rocks (especially when fast water slams you into walls). Patch them with duct tape or Flex Tape from your kit.
- Sprains and broken bones from hitting things or getting stuck in flow.
- Maiming: a serious injury lasts for the rest of that run, and teammates have to compensate. It resets on the next run.
- Some gore is allowed.

## Gear failure
- Flashlights run out of battery.
- Strong currents can flood your mask or knock it off.
- Regulator failure: undecided.

## Cold
- Caves get cold. Some areas (especially air pockets) are warmer.
- Open: what cold actually does mechanically.

## Silt-outs
- In silty or dusty areas, swimming too fast kicks up silt that fills your vision.
- You have to slow down and wait about 10 to 15 seconds for it to settle.
- The silt cloud and its fade must be rendered realistically in UE5.

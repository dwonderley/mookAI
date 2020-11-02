# mookAI
mookAI provides combat automation for low-utility NPCs. 

The mook is a creature characterizied by their lack of ambition: they must be told where to go, what to do, and when to do it. This module automates those decisions, freeing you of managing their doomed efforts.

When a hotkey is pressed ('g', for [g]o), mookAI takes the turn for the active token in the turn order*. This process consists of the following steps:
* The mook** will look around for PCs
  * If there are no PCs around, the mook will explore their surroundings until they find a PC or run out of movement
* The mook plans a collision-free path to each PC they can see
  * If the mook cannot find a collision-free path to a PC, they will still try ranged attacks later
  * If the mook has no ranged attacks and no paths, they will explore 
* The mook chooses a target based on a configurable decision rule***
  * Based on proximity
  * Based on current/max health
  * Randomly
* The mook prompts the user to confirm the plan
  * The mook is selected
  * The hero is targeted
  * The path the mook will traverse is highlighted
  * Additional information will be provided in a future release
  * If the user rejects the plan, mookAI aborts, the token doesn't move any further, and the turn does not advance
* If accepted, the mook will automatically move along the projected path, attack, and end their turn
  * mookAI will automatically use one of midi-qol, minor-qol, BetterRolls5e, or the default roller, in that order

Currently, only 5e is supported, but the core of mookAI is system-agnostic. Other systems can be implemented in a few hours by overriding the indicated methods in the MookModel class. MookModel5e demonstrates how this is done. Mainly, mookAI needs to be told where to find certain data (movement speed, attack range, actions per turn) and how to interpret it. I can't implement these models for every system, but I am more than happy to assist anyone who wants to adapt mookAI for the system they use.

mookAI provides three key bindings: [g]o, [n]ext, and [b]ack. The 'g' key activates mookAI. The other two -- 'n' and 'b' -- change whose turn it is in the combat tracker. These keys are disabled when mookAI is already active and when typing in a window.

A future update will add target and attack selection to the post-planning confirmation scene. Additionally, it will likely add a pre-planning screen where the user can change how the mook behaves, such as the number of dashes they may take, the number of attack actions they possess, and the number of attacks per action. These features are already supported for 5e, but they don't have an interface at the moment because I don't know HTML yet.

mookAI has a single dependency, <a href="https://github.com/dwonderley/lib-find-the-path/">my path finding library</a>. Originally, it was part of this module, but I split it out so others could use it independently. If you would like to use it in your own module but think it needs some additional functionality, please feel free to message me, and I'll see what I can do.

There is a known bug where sometimes the ids of combatants in the combat tracker do not match the token ids. I haven't been able to replicate this problem with consistency. The only way I've found to fix it is to delete the token and re-add it to the combat tracker. Failing that, moving to a different combat will solve the problem. This has only happened a couple of times in months of testing.

*mookAI will not take the turn of PCs

**Right now, mookAI makes no differentiation between hostile and friendly NPCs, so only use mookAI when you want to attack the players.

***Actor and token-level configuration is coming, but for right now, it is a global setting under the module configuration

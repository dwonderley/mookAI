/*
The MookModel is an abstraction of system- and user-specific information:
its intended purpose is to hold all the messy bits so that the code above it
doesn't have to handle a bunch of edge cases.
When this work is complete (or as complete as any coding project can be...),
there will be various subclasses of the MookModel that change how it behaves.
For example, there might be a CowardlyMook who avoids mele combat, a
TattleTaleMook who goes to find reinforcements, a BerserkerMook with a tunnel
vision and no range, a FlyingMook, a KitingMook etc. The ultimate goal is to
generate these mooks from a configuration file, but that's a long ways off.

Let me reiterate that full autonomy is not within the scope of this project.
mookAI is intended to automate low-threat enemies, and while it is possible to
construct complex AIs, overreliance on this module will lead to TPKs and other
negative experiences (such as executing downed characters) for your players.
This module does not free the GM of responsibility of combat outcomes. Like any
tool, its usage is at the discretion of the artist.

I intend for the MookModel to be both extendable and replaceable.
While the MookModel (and therefore the module) assumes 5e, the goal is
that this file will be split into a MookModel and a MookeModel5e and that
MookModels will be written for additional systems.
If this is done, the module can be adapted to support systems other than 5e by
having the MookAI dynamically load the corresponding MookModel.
Before that, I will be focusing on features, bug-fixes, and customizations.
Additionally, while I am attempting to keep the Mook and MookAI classes
system-agnostic (which is, in itself, a WIP :) ), I have no plans to support
any system other than 5e at this time.
If you want to implement a MookModel for the system you play, I will be happy
to review and merge in your code if you message me your intentions ahead of
time.
*/

export const MookInitiative = 
{
	DO_NOTHING: 1,
	ROTATE: 2,
	CREEP: 3,
	WANDER: 4,
}

export const ActionType =
{
	HALT: 0,
	SENSE: 1,
	PLAN: 2,
	ROTATE: 3,
	MOVE: 4,
	EXPLORE: 5,
	TARGET: 6,
	ATTACK: 7,
	STEP: 8
}

/* I have no idea what I'm doing with these random objects
export const Action =
{
	actionType: null,
	// Cost of action in terms of time.
	// The cost of moving a tile is (generally) 1 time unit.
	// The cost of rotating by some angle, might cost time.
	// Sensing the environment or planning might cost time.
	cost: null,
	// ActionType-specific data, e.g. a Point for MOVE or an angle for rotate
	data: null
}
*/

export class MookModel
{
	constructor (token_)
	{
		// todo: settings galore
		this.useRanged = false;
		this.useSight = true;
		this.mookInitiative = MookInitiative.WANDER;

		this.hasSight = token_.hasSight;
		this.visionAngle = 360;
		this.visionRange = Infinity;
		this.speed = parseInt (token_.actor.data.data.attributes.speed.value, 10);
		this._meleWeapons = token_.actor.itemTypes.weapon.filter (w => {
			return w.hasAttack && w.data.data.actionType === "mwak";
		});
		this._rangedWeapons = token_.actor.itemTypes.weapon.filter (w => {
			return w.hasAttack && w.data.data.actionType === "rwak";
		});
		this._hasRanged = this._rangedWeapons.length > 0;
	}

	get gridDistance () { return game.scenes.active.data.gridDistance; }
	get hasRanged () { return this.useRanged && this._hasRanged }
	get hasVision () { return this.useSight && this.hasSight }

	// If the range isn't defined, assume it is 1 tile
	// If the range is less than 5 feet, treat it as 1 tile
	get meleRange ()
	{
		//const dist = parseInt (this.meleWeapon.data.labels.range, 10)
		const dist = this.meleWeapon.data.data.range.value;
		return dist ? Math.max (Math.floor (dist / this.gridDistance), 1) : 1;
	}
	// todo
	get meleWeapon () { return this._meleWeapons[0]; }
	// todo
	get rangedWeapon () { return this._rangedWeapons[0]; }

	// todo: evaluate units
	get time () { return this.speed / this.gridDistance; }

	get exploreActions ()
	{
		let ret = new Array ();

		switch (this.mookInitiative)
		{
		case MookInitiative.DO_NOTHING:
			ret.push ({
				actionType: ActionType.HALT
			});
			break;
		case MookInitiative.ROTATE:
			ret.push (this.rotateAction);
			break;
		case MookInitiative.CREEP:
			ret.push (this.moveAction);
			break;
		case MookInitiative.WANDER:
			ret.push (this.rotateAction);
			ret.push (this.moveAction);
			break;
		}

		return ret;
	}

	get moveAction ()
	{
		return { actionType: ActionType.STEP, cost: 1 };
	}

	get planAction ()
	{
		return { actionType: ActionType.PLAN, cost: 0 };
	}

	get rotateAction ()
	{
		return {
			actionType: ActionType.ROTATE,
			cost: 0.5,
			data: 45 * (Math.random () > 0.5 ? 1 : -1)
		};
	}

	get senseAction ()
	{
		return { actionType: ActionType.SENSE, cost: 0 };
	}
}

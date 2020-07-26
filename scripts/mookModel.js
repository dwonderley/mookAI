/*
The MookModel is an abstraction of system- and user-specific information:
its intended purpose is to hold all the messy bits so that the code above it
doesn't have to handle a bunch of edge cases.
When this work is complete (or as complete as any coding project can be...),
there will be various configuration settings that change how mooks behave.
For example, there might be a CowardlyMook who avoids mele combat, a
TattleTaleMook who goes to find reinforcements, a BerserkerMook with a tunnel
vision and no range, a FlyingMook, a KitingMook etc. The ultimate goal is to
generate these mooks from a configuration file, but that's a long ways off.

Let me reiterate that full autonomy is not within the scope of this project.
mookAI is intended to automate low-threat enemies, and while it is possible to
construct complex AIs, overreliance on this module will lead to TPKs and other
negative experiences (such as executing downed characters) for your players.
This module does not free the GM of responsibility of combat outcomes. Like any
tool, its usage is at the discretion of the practitioner.

The goal for this class is to implement different subclasses for systems other than DnD5e. This process is relatively simple, as only few methods need to be overridden, as demonstrated by MookModel5e below.
If this is done, the module should be able to support those systems without additional changes since everything "above" it has been designed to be system-agnostic. The only other change is that the system name must be added to the getMookModel static function below.
At the moment, I am prioritizing functionality and bug fixes and have no plans to support other systems. However, if you want to implement a MookModel for the system you play, I will be happy to work with you and to review and merge in your code
*/
import { MookModelSettings, MookInitiative  } from "./mookModelSettings.js"

/*
Actions are objects that contain:
1) ActionType
2) Cost (in units of "time")
3) Data
Actions of ActionType 0-7 are provided by the base MookModel, and these functions should not be overloaded
Actions of ActionType 8+ are attacks and are handled by system-specific MookModels. There should be a method to create an Action of the above form and an attack () method to handle those actions. See MookModel5e for an example.
*/
export const ActionType =
{
	// To my knowledge, these are system-agnostic, but if not, message me, and I'll see if I can support your system!
	HALT: 0,
	SENSE: 1,
	PLAN: 2,
	ROTATE: 3,
	FACE: 4,
	// Move to a point
	// todo: remove?
	MOVE: 5,
	// Move forward one tile
	// todo: Move to an *adjacent* tile?
	STEP: 6,
	EXPLORE: 7,
	TARGET: 8,
	// Subsystems should provide methods for these
	MELE_ATTACK: 9,
	RANGED_ATTACK: 10,
	// todo: Spell attack? Not very mook-like, but perhaps useful to someone
}

// Abstract class. Use the static getMookModel method until I figure out the "correct" way to do it in JS
export class MookModel
{
	constructor (token_)
	{
		this.settings = new MookModelSettings (token_);

		this._hasSight = token_.hasSight;
		// Override these in system extensions
		this._hasMele = false;
		this._hasRanged = false;
	}

	static getMookModel (token_, ...args_)
	{
		switch (game.system.id)
		{
		case ("dnd5e"):
			return new MookModel5e (token_, ...args_);
		}

		return null;
	}

	// Do not override
	haltAction () { return { actionType: ActionType.HALT, cost: 0 }; }
	stepAction () { return { actionType: ActionType.STEP, cost: 1 }; }
	planAction () { return { actionType: ActionType.PLAN, cost: 0 }; }
	rotateAction (deg_)
	{
		return {
			actionType: ActionType.ROTATE,
			cost: this.settings.rotationCost,
			data: deg_
		}
	}
	faceAction (token_) { return { actionType: ActionType.FACE, data: token_ } }
	randomRotateAction () { return this.rotateAction (45 * (Math.random () > 0.5 ? 1 : -1)); }
	senseAction () { return { actionType: ActionType.SENSE, cost: 0 }; }

	// Maybe override?
	exploreActions ()
	{
		let ret = new Array ();

		switch (this.settings.mookInitiative)
		{
		case MookInitiative.DO_NOTHING:
			ret.push (this.haltAction ());
			break;
		case MookInitiative.ROTATE:
			ret.push (this.randomRotateAction ());
			break;
		case MookInitiative.CREEP:
			ret.push (this.stepAction ());
			break;
		case MookInitiative.WANDER:
			ret.push (this.randomRotateAction ());
			ret.push (this.stepAction ());
			break;
		}

		return ret;
	}

	// Override as needed
	meleAttackAction ()
	{
		return { actionType: ActionType.MELE_ATTACK, data: this.meleWeapon };
	}
	rangedAttackAction ()
	{
		return { actionType: ActionType.RANGED_ATTACK, data: this.rangedWeapon };
	}

	// Subclasses MUST override
	// action_ is either a MELE_ATTACK or a RANGED_ATTACK
	async attack (action_) { throw "Game system not supported" };

	// Do not override
	get gridDistance () { return game.scenes.active.data.gridDistance; }
	get hasMele () { return this.settings.useMele && this._hasMele }
	get hasRanged () { return this.settings.useRanged && this._hasRanged }
	get hasVision () { return this.settings.useSight && this._hasSight }
	get planningStrategy () { return this.settings.planningStrategy; }

	// Maybe override?
	// todo: Advanced weapon selection
	get meleWeapon () { return this.hasMele ? this._meleWeapons[0] : null; }
	get rangedWeapon () { return this.hasRanged ? this._rangedWeapons[0] : null; }

	// Extensions must override these methods
	get meleRange () { throw "Game system not supported"; }
	get rangedRange () { throw "Game system not supported"; }
	get time () { throw "Game system not supported"; }
};

class MookModel5e extends MookModel
{
	constructor (token_, ...args_)
	{
		super (token_);

		this._speed = parseInt (token_.actor.data.data.attributes.speed.value, 10);
		this._meleWeapons = token_.actor.itemTypes.weapon.filter (w => {
			return w.hasAttack && w.data.data.actionType === "mwak";
		});
		this._rangedWeapons = token_.actor.itemTypes.weapon.filter (w => {
			return w.hasAttack && w.data.data.actionType === "rwak";
		});
		this._hasMele = this._meleWeapons.length > 0;
		this._hasRanged = this._rangedWeapons.length > 0;
	}

	// action_ is either a MELE_ATTACK or a RANGED_ATTACK
	async attack (action_)
	{
		// As implemented, DnD5e doesn't care what type of attack it is, but it must still be an attack
		if (action_.actionType !== ActionType.RANGED_ATTACK && action_.actionType !== ActionType.MELE_ATTACK)
			return;

		if (game.modules.get("minor-qol")?.active)
		{
			await MinorQOL.doMacroRoll (event, action_.data.data.name).catch (err => {
				ui.notifications.warn ("mookAI | Problem encountered: " + err);
			});
		}
		else if (game.modules.get("betterrolls5e")?.active)
		{
			BetterRolls.quickRoll (action_.data.data.name);
		}
		else
		{
			game.dnd5e.rollItemMacro(action_.data.data.name);
		}
	}

	get meleRange ()
	{
		const dist = this.meleWeapon.data.data?.range?.value;

		if (! dist) return this.settings.standardMeleWeaponTileRange;

		return Math.max (Math.floor (dist / this.gridDistance), 1);
	}
	get rangedRange ()
	{
		const dist = this.rangedWeapon.data.data?.range?.value;

		if (! dist) return this.settings.standardRangedWeaponTileRange;

		return Math.max (Math.floor (dist / this.gridDistance), 1);
	}

	// A measure of the amount of time a mook has to do stuff
	// todo: evaluate units
	get time () { return this._speed / this.gridDistance; }
};

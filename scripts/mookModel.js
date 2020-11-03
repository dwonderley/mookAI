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

If this is done, the module should be able to support those systems without additional changes since everything "above" it has been designed to be system-agnostic. The two exceptions are that the system name must be added to the getMookModel static function below.

At the moment, I am prioritizing functionality and bug fixes and have no plans to support other systems. However, if you want to implement a MookModel for the system you play, I will be happy to work with you and to review and merge in your code
*/
import { MookModelSettings, MookModelSettings5e, MookInitiative  } from "./mookModelSettings.js"

/*
Actions are objects that contain:
1) ActionType
2) Cost (in units of "time")
3) Data
Actions of ActionType 0-9 are provided by the base MookModel, and these functions should not be overloaded
Actions of ActionType 10+ are handled by system-specific MookModels. There should be a method to create and use Actions of those types. See MookModel5e for an example.
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
	// Move along entire path
	TRAVERSE: 7,
	EXPLORE: 8,
	TARGET: 9,
	// Subsystems must provide a method to handle this
	ATTACK: 11,
	// todo
	ZOOM: 10,
	CAST: 12,
}

class Ability
{
	constructor (type_, data_)
	{
		this.type = type_;
		this.data = data_;
		this.used = false;

		if (this.data.recharge === undefined)
			this.data.recharge = obj_ => { obj_.used = false };
	}

	act (data_)
	{
		if (! this.can ())
			return null;

		this.used = true;

		if (this.data.act === undefined)
			return null;

		return this.data.act (data_);
	}
	can () { return ! this.used; }
	recharge () { this.data.recharge (this); }
};
/*
		if (this.data.can === undefined)
			this.data.can = obj_ => { return ! obj_.used; };
		if (this.data.recharge === undefined)
			this.data.recharge = obj_ => { obj_.used = false };
	}

	async act (data_)
	{
		if (! this.can ())
			return null;

		this.used = true;
		return await this.data?.act (data_);
	}
	async can () { return await this.data.can (this); }
	async recharge () { return await this.data.recharge (this); }
*/

// Abstract class
export class MookModel
{
	constructor (token_, settings_)
	{
		this.settings = settings_;
		this._token = token_;

		this._actions = new Array ();
		this._targetHistory = new Array ();

		this.attacksRemaining = 0;
		this.zoomsRemaining = 0;
	}

	static getMookModel (token_, ...args_)
	{
		switch (game.system.id)
		{
		case ("dnd5e"):
			return new MookModel5e (token_, new MookModelSettings5e (token_), ...args_);
		}

		return null;
	}

	// Do not override these
	async attack (action_) { _attack (action_); }
	haltAction () { return { actionType: ActionType.HALT, cost: 0 }; }
	planAction () { return { actionType: ActionType.PLAN, cost: 0 }; }
	rotateAction (deg_)
	{
		return {
			actionType: ActionType.ROTATE,
			cost: this.settings.rotationCost,
			data: deg_
		}
	}
	senseAction () { return { actionType: ActionType.SENSE, cost: 0 }; }
	// Reset the mook model's resources for use
	startTurn () { this.resetResources (); this._startTurn (); }
	stepAction () { return { actionType: ActionType.STEP, cost: 1 }; }
	resetResources () { this._resetResources (); }

	// Override as needed
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
	// Override this and exploreActions if you want your mooks to do something instead of wander around
	explore (data_) { return; }
	faceAction (token_) { return { actionType: ActionType.FACE, data: token_ }; }
	meleAttackAction () { return { actionType: ActionType.ATTACK, data: { weapon: this.meleWeapon }}; }
	rangedAttackAction () { return { actionType: ActionType.ATTACK, data: { weapon: this.rangedWeapon }}; }
	randomRotateAction () { return this.rotateAction (45 * (Math.random () > 0.5 ? 1 : -1)); }
	_resetResources () { }
	_startTurn () { }
	zoom () { return this.time; }

	// Subclasses MUST override
	_attack (action_) { throw "Game system not supported"; }

	// Do not override
	get gridDistance () { return game.scenes.active.data.gridDistance; }
	get hasMele () { return this.settings.useMele && this._hasMele; }
	get hasRanged () { return this.settings.useRanged && this._hasRanged; }
	get hasSight () { return this.token.hasSight; }
	get hasVision () { return this.settings.useSight && this.hasSight; }
	get token () { return this._token; }

	addTarget (target_) { this._targetHistory.push (target_); }
	get firstTarget () { return this._targetHistory.length === 0 ? null : this._targetHistory[0]; }
	get lastTarget () { return this._targetHistory.length === 0 ? null : this._targetHistory[this._targetHistory.length - 1]; }
	get targetHistory () { return this._targetHistory; }

	// Override as needed
	get attacksPerTurn () { return 1; }
	get canAttack () { return this.attacksRemaining > 0; }
	// Can the token do something to increase its movement range?
	get canZoom () { return this.zoomsRemaining > 0; }
	getHealthPercent (token_) { return this.getCurrentHealth (token_) / this.getMaxHealth (token_); }
	// todo: Advanced weapon selection
	get meleWeapon () { return this.hasMele ? this.meleWeapons[0] : null; }
	get rangedWeapon () { return this.hasRanged ? this.rangedWeapons[0] : null; }
	get zoomsPerTurn () { return 1; }

	// Extensions must override these methods
	get meleRange () { throw "Game system not supported"; }
	get rangedRange () { throw "Game system not supported"; }
	getCurrentHealth (token_) { throw "Game system not supported"; }
	getMaxHealth (token_) { throw "Game system not supported"; }
	// Resource measuring how much a token can do on their turn. It takes one time unit for a token to move one tile
	get time () { throw "Game system not supported"; }
};

class MookModel5e extends MookModel
{
	constructor (token_, settings_, ...args_)
	{
		super (token_, settings_);

		this.actionsUsed = 0;
		// Creatures in 5e may only use one bonus action
		this.bonusActionUsed = false;
	}

	async doAttack (name_)
	{
		if (game.modules.get("betterrolls5e")?.active)
		{
			BetterRolls.quickRoll (name_);
		}
		else
		{
			game.dnd5e.rollItemMacro(name_);
		}
	}

	async attack (action_)
	{
		// As implemented, DnD5e doesn't care what type of attack it is, but it must still be an attack
		if (action_.actionType !== ActionType.ATTACK)
			return;

		if (! this.canAttack)
			return;

		const name = action_.data.weapon.data.name;

		this._actions.filter (a => a.type === "attack" && a.can ()).forEach (a => {
			if (a.data.duration === "full")
			{
				if (this.actionsUsed >= this.settings.actionsPerTurn) return;

				for (let i = 0; i < this.settings.attacksPerAction; ++i)
					this.doAttack (name);

				++this.actionsUsed;
				// todo: a.act is doAttack
				a.act ();
			}
			else if (a.data.duration === "bonus")
			{
				if (this.bonusActionUsed) return;

				for (let i = 0; i < this.settings.attacksPerBonusAction; ++i)
					this.doAttack (name);

				this.bonusActionUsed = true;
				a.act ();
				return;
			}
			else
			{
				for (let i = 0; i < this.settings.attacksPerFreeAction; ++i)
					this.doAttack (name);

				a.act ();
				return;
			}
		});
	}

	_resetResources ()
	{
		this._actions = new Array ();
		this.actionsUsed = 0;
		this.bonusActionUsed = 0;
	}

	_startTurn ()
	{
		if (this.useDashAction)
		{
			const dashAct = () => { return this.time; };

			for (let i = 0; i < this.settings.dashActionsPerTurn; ++i)
				this._actions.push (new Ability ("dash", { "duration": "full", "act": dashAct }));
			if (this.hasDashBonusAction)
				this._actions.push (new Ability ("dash", { "duration": "bonus", "act": dashAct }));
			if (this.hasDashFreeAction)
				this._actions.push (new Ability ("dash", { "duration": "free", "act": dashAct }));
		}

		for (let i = 0; i < this.settings.actionsPerTurn; ++i)
			this._actions.push (new Ability ("attack", { "duration": "full" }));
		if (this.settings.hasBonusAttack)
			this._actions.push (new Ability ("attack", { "duration": "bonus" }));
		if (this.settings.hasFreeAttack)
			this._actions.push (new Ability ("attack", { "duration": "free" }));
	}

	zoom ()
	{
		if (! this.canZoom)
			return 0;

		const dashActions = this._actions.filter (a => {
			return a.type === "dash" && a.can ();
		});

		if (dashActions.length === 0)
			return 0;

		const takeAction = (arr, str) =>
		{
			const actions = arr.filter (a => a.data.duration === str);

			if (actions.length !== 0)
				return actions[0].act ();

			return 0;
		};

		const freeZoom = takeAction (dashActions, "free");
		if (freeZoom > 0) return freeZoom;

		const bonusZoom = takeAction (dashActions, "bonus");
		if (bonusZoom > 0)
		{
			this.bonusActionUsed = true;
			return bonusZoom;
		}

		const fullZoom = takeAction (dashActions, "full");
		if (fullZoom > 0)
		{
			++this.actionsUsed;
			return fullZoom;
		}

		console.log ("mookAI | Hit unreachable state: MookModel5e::zoom ()");
		return 0;
	}

	get meleWeapons ()
	{
		return this.token.actor.itemTypes.weapon.filter (w => {
			return w.hasAttack && w.data.data.actionType === "mwak";
		});
	}

	get rangedWeapons ()
	{
		return this.token.actor.itemTypes.weapon.filter (w => {
			return w.hasAttack && w.data.data.actionType === "rwak";
		});
	}

	get _hasMele ()
	{
		return this.meleWeapons.length > 0;
	}

	get _hasRanged ()
	{
		return this.rangedWeapons.length > 0;
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

	get canAttack ()
	{
		const attacks = this._actions.filter (a => a.type === "attack");
		
		if (this.actionsUsed < this.settings.actionsPerTurn
		    && attacks.some (a => a.data.duration === "full" && a.can ()))
			return true;

		if (! this.bonusActionUsed && attacks.some (a => a.data.duration === "bonus" && a.can ()))
			return true;

		return attacks.some (a => a.data.duration === "free" && a.can ());
	}
	get canZoom ()
	{ 
		const dashes = this._actions.filter (a => a.type === "dash");

		if (this.actionsUsed < this.settings.actionsPerTurn
		    && dashes.some (a => a.data.duration === "full" && a.can ()))
			return true;

		if (! this.bonusActionUsed && dashes.some (a => a.data.duration === "bonus" && a.can ()))
			return true;

		return dashes.some (a => a.data.duration === "free" && a.can ());
	}


	// Get various token data
	getCurrentHealth (token_ = this.token)
	{
		return token_.actor.data.data.attributes.hp.value;
	}
	getMaxHealth (token_ = this.token)
	{
		return token_.actor.data.data.attributes.hp.max;
	}

	get hasDashAction () { return this.settings.dashActionsPerTurn > 0; }
	get hasDashBonusAction () { return this.settings.hasDashBonusAction; }
	get hasDashFreeAction () { return this.settings.hasDashFreeAction; }
	get useDashAction ()
	{
		return this.settings.useDashAction
		       && (this.hasDashAction || this.hasDashBonusAction || this.hasDashFreeAction);
	}

	// A measure of the amount of time a mook has to do stuff
	// todo: evaluate units
	get time ()
	{
		return parseInt (this.token.actor.data.data.attributes.speed.value, 10) / this.gridDistance;
	}
	get zoomsPerTurn ()
	{
		if (! this.useDashAction)
			return 0;

		return this.settings.dashActionsPerTurn + this.hasDashBonusAction + this.hasDashFreeAction;
	}
};

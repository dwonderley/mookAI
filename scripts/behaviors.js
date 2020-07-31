import { getPointFromToken, Point } from "./point.js";

// If you want me to remove your name from here, message me, and I'll do it :)
export const MookTypes =
{
	// Uses mele attacks first, attacks closest
	EAGER_BEAVER: 1,
	// Uses ranged attacks first, attacks furthest
	WARY_GARY: 2,
	// Attacks character with lowest health
	NELSON: 3,
	// Attacks previous target, otherwise attacks closest
	CARL: 4,
	// Attacks a random target in range
	SHIA: 5,
	// Attacks last token to attack mook
	// Attacks first token to attack mook
	// Attacks bigest source of personal damage
	// Attacks bigest source of total damage
	// Attacks token that last killed an ally
	// Attacks token that has killed the most allies
	// Pack tactics
	
	// Secret GM tech (don't use too many of these, or they'll catch on):
	// Attacks healthiest
	VEGETA: 9001,
	// Runs to get help (or not)
	SIR_ROBBIN: 9002,
	// Attacks highest "armor"
	// Attacks next in turn order
}

export class Target
{
	constructor (token_, range_, action_)
	{
		this._attackAction = action_;
		this._range = range_;
		this._token = token_;
	}

	get attackAction () { return this._attackAction; }
	get id () { return this._token.id; }
	get range () { return this._range; }
	get token () { return this._token; }
}

// much todo: about something
export class Behaviors
{
	// todo: needs to track all behavior-relevant data...
	constructor () {}

	// Chooses which target the mook will attack using a set of behaviors.
	// The mooks behaviors are (will be) configured from their actor page
	static chooseTarget (mook_, targets_)
	{
		switch (mook_.mookModel.settings.mookType)
		{
		case (MookTypes.EAGER_BEAVER):
			return Behaviors.attackClosest (mook_, targets_);
		}

		throw "Failed to select a target";
	}
	static attackClosest (mook_, targets_)
	{
		const mookModel = mook_.mookModel;
		if (mookModel.hasMele && targets_.mele.length > 0)
		{
			const token = Behaviors.getSmallest (targets_.mele, e => {
				return Point.Euclidean (mook_.point, getPointFromToken (e));
			});
			return new Target (token, mook_.mookModel.meleRange, mook_.mookModel.meleAttackAction ());
		}
		else if (mookModel.hasRanged && targets_.ranged.length > 0)
		{
			const token = Behaviors.getSmallest (targets_.ranged, e => {
				return Point.Euclidean (mook_.point, getPointFromToken (e));
			});
			return new Target (token, mook_.mookModel.rangedRange, mook_.mookModel.rangedAttackAction ());
		}

		return null;
	}

	static getSmallest (array_, func_)
	{
		let val = Infinity;
		let out = null;

		for (let i = 0; i < array_.length; ++i)
		{
			const v = func_ (array_[i]);

			if (v < val)
			{
				out = array_[i];
				val = v;
			}
		}

		return out;
	}
}

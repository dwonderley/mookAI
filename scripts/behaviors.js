// todo: This whole thing is getting overhauled. The list below is for brainstorming. Send me any ideas/requests you have!

// If you want me to remove your name from here, message me, and I'll do it :)
export const MookTypes = Object.freeze ({
	// Uses mele attacks first, attacks closest
	EAGER_BEAVER: 1,
	// Uses ranged attacks first, minimizes movement, attacks furtherst
	WARY_GARY: 2,
	// Attacks character with lowest health
	NERVOUS_NELSON: 3,
	// Attacks previous target, otherwise attacks closest
	PERSISTENT_PAUL: 4,
	// Attacks a random target in range
	SHIA_SURPRISE: 5,
	// Attacks last token to attack mook
	REPRISING_OLIVIA: 6,
	// Attacks first token to attack mook
	VENGEFUL_CANDICE: 7,
	// Attacks bigest source of personal damage
	// Attacks bigest source of total damage
	// Attacks token that last defeated an ally
	// Attacks token that has defeated the most allies
	AVENGING_MICHAEL: 12,
	// Pack tactics
	GOOD_BOI: 13,
	// Attacks next in turn order
	ANALYTICAL_ALLISON: 14,

	// Secret GM tech (don't use too many of these, or they'll catch on):
	// Attacks healthiest
	VEGETA: 9001,
	// Runs to get help (or not)
	SIR_ROBBIN: 9002,
	// Attacks highest "armor"
});

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
			return Behaviors.attackByDistance (mook_, targets_, false);
		case (MookTypes.NELSON):
			return Behaviors.attackByCurrentHealth (mook_, targets_, false);
		case (MookTypes.SHIA):
			return Behaviors.surprise (mook_, targets_);
		case (MookTypes.VEGETA):
			return Behaviors.attackByCurrentHealth (mook_, targets_, true);
		default:
			console.log ("mookAI | Unsupported mook type!");
			mook_.settings.mookType = MookTypes.SHIA;
			return Behaviors.surprise (mook_, targets_);
		}

		throw "Failed to select a target";
	}

	static attackByValue (mm_, targets_, evaluator_, min_)
	{
		const comparator = min ? Behaviors.getLargest : Behaviors.getSmallest;

		const meleToken = comparator (targets_.mele?.map (t => t.token), evaluator_);
		const rangedToken = comparator (targets_.ranged?.map (t => t.token), evaluator_);

		if (! meleToken && ! rangedToken)
			return null;

		if (! meleToken)
			return new Target (rangedToken, mm_.rangedRange, mm_.rangedAttackAction ());

		if (! rangedToken)
			return new Target (meleToken, mm_.meleRange, mm_.meleAttackAction ());

		// We want either the smallest or largest value depending on min_. We can find that with an xor.
		if ((evaluator_ (meleToken) <= evaluator_ (rangedToken)) ^ min_)
			return new Target (meleToken, mm_.meleRange, mm_.meleAttackAction ());

		return new Target (rangedToken, mm_.rangedRange, mm_.rangedAttackAction ());
	}

	static attackByDistance (mook_, targets_, gmTech_)
	{
		const func = gmTech_ ? Behaviors.getLargest : Behaviors.getSmallest;
		const mm = mook_.mookModel;

		if (mm.hasMele && targets_.mele.length > 0)
		{
			const token = func (targets_.mele, t => {
				return mook_.pathManager.path (mook_.token.id, t.id).cost;
			});
			return new Target (token, mm.meleRange, mm.meleAttackAction ());
		}
		else if (mm.hasRanged && targets_.ranged.length > 0)
		{
			const token = func (targets_.ranged, t => {
				return mook_.pathManager.path (mook_.token.id, t.id).cost;
			});
			return new Target (token, mm.rangedRange, mm.rangedAttackAction ());
		}

		return null;
	}

	static attackByCurrentHealth (mook_, targets_, gmTech_)
	{
		const getHealth = mook_.mookModel.getCurrentHealth;
		return attackByValue (mook_.mookModel, targets_, getHealth, gmTech_);
	}

	static surprise (mook_, targets_)
	{
		const mm = mook_.mookModel;
		const numTargets = (mm.hasMele ? targets_.mele.length : 0)
				 + (mm.hasRanged ? targets_.ranged.length : 0);
		
		if (! numTargets) return null;

		let targetNum = Math.floor (Math.random () * numTargets);

		if (mm.hasMele)
		{
			if (targets_.mele.length > targetNum)
				return new Target (targets_.mele[targetNum],
						   mm.meleRange,
						   mm.meleAttackAction ());
			
			targetNum -= targets_.mele.length;
		}

		return new Target (targets_.ranged[targetNum],
				   mm.rangedRange,
				   mm.rangedAttackAction ());
	}

	static getLargest (array_, func_)
	{
		if (! array_ || ! func_)
			return null;

		let val = -Infinity;
		let out = null;

		for (let i = 0; i < array_.length; ++i)
		{
			const v = func_ (array_[i]);

			if (v > val)
			{
				out = array_[i];
				val = v;
			}
		}

		return out;
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

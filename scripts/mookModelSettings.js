import { MookTypes } from "./behaviors.js"
import { Mook } from "./mook.js";

// Controls what a mook does when their are no viable targets
export const MookInitiative = 
{
	// Mook ends their turn
	DO_NOTHING: 1,
	// Mook spins in place randomly
	ROTATE: 2,
	// Mook moves in a line
	// todo: Make mooks avoid walls
	CREEP: 3,
	// Mook spins in place randomly
	// todo: Make mooks avoid walls
	WANDER: 4,
}

function settingIndexToString (str1_, str2_)
{
	return game.settings.settings.get (str1_).choices[game.settings.get ("mookAI", str2_)];
}

// todo: stack behaviors? Probability distribution?
export class MookModelSettings
{
	constructor (token_)
	{
		// todo: Use the token's actor to access individualized mook settings
		const actor = token_.actor;

		this.mookType = MookTypes[settingIndexToString ("mookAI.MookType", "MookType")];

		// false indicates "do not automate this token"
		// todo: default false when actor-level configuration works
		this.useAI = "true";

		this.useMele = game.settings.get ("mookAI", "UseMele");
		this.useRanged = game.settings.get ("mookAI", "UseRanged");
		// false indicates that the mook can see everyone
		this.useSight = game.settings.get ("mookAI", "UseVision");
		this.rotationCost = game.settings.get ("mookAI", "RotationCost"); 

		this.mookInitiative = MookInitiative[settingIndexToString ("mookAI.MookInitiative", "MookInitiative")];

		if (this.mookInitiative === MookInitiative.ROTATE && this.rotationCost === 0)
			this.mookInitiative = MookInitiative.DO_NOTHING;

		if (this.rotationCost < 0) this.rotationCost = 0;
		if (this.rotationCost > 1) this.rotationCost = 1;

		// todo: When I get configuration working, mooks won't attack members of the same faction (probably checking for substrings: a goblin cultist might not attack other goblins or other cultists). Right now, mooks only attack PCs.
		// An override to the above. Some tokens, such as light sources, vehicles, etc. should not be attacked.
		// false indicates "mooks should not attack this token"
		// todo: default false when configuration works
		this.attackable = "true";
		this.faction = "hostile";

		// The max weapon distance, in tiles, if not provided by a weapon
		this.standardMeleWeaponTileRange = game.settings.get ("mookAI", "StandardMeleTileRange");
		if (this.standardMeleWeaponTileRange < 0) this.standardMeleWeaponTileRange = 1;
		this.standardRangedWeaponTileRange = game.settings.get ("mookAI", "StandardRangedTileRange");
		if (this.standardRangedWeaponTileRange < 0) this.standardRangedWeaponTileRange = 12;

		/* todo? Configure token vision from configuration page
		this.visionAngle = 360;
		this.visionRange = Infinity;
		*/
	}
};

export class MookModelSettings5e extends MookModelSettings
{
	constructor (token_)
	{
		super (token_);

		this.actionsPerTurn = 2;
		this.attacksPerAction = 1;

		this.hasBonusAttack = true;
		this.attacksPerBonusAction = 0;
		this.hasFreeAttack = true;
		this.attacksPerFreeAction = 1;

		this.useDashAction = true;

		this.dashActionsPerTurn = 2;
		this.hasDashBonusAction = false;
		this.hasDashFreeAction = false;
	}
};

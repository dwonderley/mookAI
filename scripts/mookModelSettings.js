import { MookTypes } from "./behaviors.js"

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

// todo: stack behaviors? Probability distribution?
export class MookModelSettings
{
	constructor (token_)
	{
		// todo: Use the token's actor to access individualized mook settings
		const actor = token_.actor;

		this.mookType = MookTypes.EAGER_BEAVER;

		// false indicates "do not automate this token"
		// todo: default false when configuration works
		this.useAI = "true";

		this.useMele = true;
		this.useRanged = true;
		// false indicates that the mook can see everyone
		this.useSight = true;
		this.mookInitiative = MookInitiative.WANDER;
		this.rotationCost = 0.5;

		// todo: When I get configuration working, mooks won't attack members of the same faction (probably checking for substrings: a goblin cultist might not attack other goblins or other cultists). Right now, mooks only attack PCs.
		// An override to the above. Some tokens, such as light sources, vehicles, etc. should not be attacked.
		// false indicates "mooks should not attack this token"
		// todo: default false when configuration works
		this.attackable = "true";
		this.faction = "hostile";

		// The max weapon distance, in tiles, if not provided by a weapon
		this.standardMeleWeaponTileRange = 1;
		this.standardRangedWeaponTileRange = 12;

		/* todo? Configure token vision from configuration page
		this.visionAngle = 360;
		this.visionRange = Infinity;
		*/
	}
};

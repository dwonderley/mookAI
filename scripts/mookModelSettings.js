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

export class MookModelSettings
{
	constructor (token_)
	{
		// todo: Use the token's actor to access individualized mook settings
		const actor = token_.actor;

		this.useMele = true;
		this.useRanged = true;
		this.useSight = true;
		this.mookInitiative = MookInitiative.WANDER;
		this.rotationCost = 0.5;
		this.planningStrategy = null;

		// The max weapon distance, in tiles, if not provided by a weapon
		this.standardMeleWeaponTileRange = 1;
		this.standardRangedWeaponTileRange = 12;

		/* todo? Configure token vision from configuration page
		this.visionAngle = 360;
		this.visionRange = Infinity;
		*/
	}
};

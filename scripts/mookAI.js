import { Abort, Mook } from "./mook.js"
import { MinkowskiParameter } from "/modules/lib-find-the-path/scripts/point.js";
import { FTPUtility } from "/modules/lib-find-the-path/scripts/utility.js";

// Check if combat is active on startup
// When combat updates, add a mook for each npc in combat
// createCombat
// createCombatant

let mookAI;

function getDistanceMetric ()
{
	return MinkowskiParameter[game.settings.settings.get ("mookAI.DistanceMetric").choices[game.settings.get ("mookAI", "DistanceMetric")]];
}

export function initAI ()
{
	mookAI = new MookAI ();

	game.settings.register ("mookAI", "DistanceMetric", {
		name: "Distance Metric",
		hint: "Distance on a grid can be measured multiple ways. Manhattan treats adjacent tiles as one unit away and diagonals as two. Chebyshev treats adjacent and diagonal tiles as one unit away. Euclidean (not recommended) treats tiles as though they existed in actual space: the center-to-center distance to diagonal tiles is sqrt(2) units.",
		scope: "world",
		config: true,
		default: "Manhattan",
		type: String,
		choices: ["Chebyshev", "Euclidean", "Manhattan"],
	});

	game.settings.register ("mookAI", "MoveAnimationDelay", {
		name: "Move Animation Delay",
		hint: "Controls the amount of time between mook token movements. Measured in miliseconds.",
		scope: "world",
		config: true,
		default: "400",
		type: Number,
	});

	game.settings.register ("mookAI", "RotationAnimationDelay", {
		name: "Rotation Animation Delay",
		hint: "Controls the max delay between mook rotation and their next movement. Varies by amount turned. Measured in miliseconds.",
		scope: "world",
		config: true,
		default: "400",
		type: Number,
	});

	game.settings.register ("mookAI", "MookType", {
		name: "Mook Type",
		hint: "Controls how mooks behave. Eager Beavers attack the closest token, using range only when there are no mele targets. Shias attack a random target in range. This feature is not fully developed. Consult documentation for specifics.",
		scope: "world",
		config: true,
		default: "EAGER_BEAVER",
		type: String,
		choices: ["EAGER_BEAVER", "SHIA"],
	});

	game.settings.register ("mookAI", "UseVision", {
		name: "Use Vision",
		hint: "If enabled, mooks will only attack enemies their tokens can see. If disabled, mooks have omniscient: they have full knowledge of the location of all tokens and the optimal path around/through all obstacles (such as mazes). Make sure that token vision is enabled and configured!",
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
	});

	game.settings.register ("mookAI", "MookInitiative", {
		name: "Mook Initiative",
		hint: "Controls what mooks do when there is no target within range. They can do nothing, rotate in place, creep forward 1 tile at a time, or wander aimlessly (rotate + creep). If they find an enemy while \"exploring\" that is in range (after accounting for how far they have already moved), they will attack that target according to their configured behavior. In either case, they will pass their turn in combat afterward.",
		scope: "world",
		config: true,
		default: "WANDER",
		type: String,
		choices: ["DO_NOTHING", "ROTATE", "CREEP", "WANDER"],
	});

	game.settings.register ("mookAI", "RotationCost", {
		name: "Rotation Cost",
		hint: "When exploring, mooks may end up rotating to search for heroes to die against. This setting controls how much movement, in tiles, each rotation costs. It can be set between 0.0 and 1.0 tiles unless the mook's initiative is set to \"Rotate.\" If the mook is configured to rotate, and the rotation cost is 0.0, then they will \"Do Nothing\" instead.",
		scope: "world",
		config: true,
		default: 0.2,
		type: Number,
	});

	game.settings.register ("mookAI", "UseMele", {
		name: "Mooks may use mele attacks",
		hint: "If enabled, mooks will check if they can make mele attacks. If disabled, they will not.",
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
	});

	game.settings.register ("mookAI", "UseRanged", {
		name: "Mooks may use ranged attacks",
		hint: "If enabled, mooks will check if they can make ranged attacks. If disabled, they will not.",
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
	});

	game.settings.register ("mookAI", "StandardMeleTileRange", {
		name: "Default mele weapon attack radius",
		hint: "Some mele weapons do not provide a max range. This setting, in units of tiles, is a fallback to allow mooks to attack in such instances. Setting this value to zero will prevent mooks from attacking with a ranged weapon that has no explicit range value. They will explore instead.",
		scope: "world",
		config: true,
		default: 1,
		type: Number,
	});

	game.settings.register ("mookAI", "StandardRangedTileRange", {
		name: "Default ranged weapon attack radius",
		hint: "Some ranged weapons do not provide a max range. This setting, in units of tiles, is a fallback to allow mooks to attack in such instances. Setting this value to zero will prevent mooks from attacking with a ranged weapon that has no explicit range value. They will explore instead.",
		scope: "world",
		config: true,
		default: 12,
		type: Number,
	});

	Hooks.on ("ready", () => {
		if (! mookAI.ready ())
			mookAI = {};
	});
}

export class MookAI
{
	constructor ()
	{
		this._busy = true;
		this._combats = new Map ();
	}

	ready ()
	{
		if (! game.user.isGM)
		{
			// todo?: let heroes have mooks
			console.log ("mookAI | Heroes don't have mooks!");
			return false;
		}

		Hooks.on ("updateToken", (scene_, token_, changes_, diff_, sceneID_) => {
			if (! diff_)
				return;
		
			this.updateTokens (changes_);
		});

		Hooks.on ("createCombatant", (combat_, combatant_, obj_, id_) => {
			this.addCombatant (combat_.id, combatant_.tokenId);
		});
		Hooks.on ("deleteCombatant", (combat_, combatant_, obj_, id_) => {
			this.deleteCombatant (combat_, combatant_.tokenId);
		});
		Hooks.on ("createCombat", (combat_, obj_, id_) => {
			this.combatStart (combat_);
		});
		Hooks.on ("deleteCombat", (combat_, obj_, id_) => {
			this.combatEnd (combat_);
		});
		Hooks.on ("updateScene", (...args) => { this.handleSceneChange () });

		document.addEventListener('keyup', evt => {
			if (evt.key !== 'b' || ! evt.target.classList.contains ("game") || this.busy)
				return;

			game.combat.previousTurn ();
		});

		document.addEventListener('keyup', evt => {
			if (evt.key !== 't')
				return;

			console.time ("myTimer");
			const pm = game.FindThePath.Chebyshev.PathManager;

			(async () => {
				const points = await pm.pointsWithinRangeOfToken (canvas.tokens.placeables[0], 10);
				points.sort ((a, b) => {
					return 100 * (a.segment.point.x-b.segment.point.x)
						   + (a.segment.point.y - b.segment.point.y)
				});
				const segs = points.map (p => p.segment );
				const dists = points.map (p => p.dist );
				console.log (segs);
				console.log (dists);
				const ftpUtility = new FTPUtility ();
				ftpUtility.highlightSegments (segs);
			}) ();
			console.timeEnd ("myTimer");
		});

		document.addEventListener('keyup', evt => {
			if (evt.key !== 'n' || ! evt.target.classList.contains ("game") || this.busy)
				return;

			game.combat.nextTurn ();
		});

		if (game.modules.get("lib-find-the-path")?.active)
		{
			document.addEventListener('keyup', evt => {
				if (evt.key !== 'g' || ! evt.target.classList.contains ("game") || this.busy)
					return;
	
				this.takeTurn ();
			});
		}
		else
		{
			const str = "mookAI | Missing module dependency: Library - Path Planning. Please check that it is installed and enabled. mookAI cannot automate without it."
			ui.notifications.notify (str, "error", { "permanent": true });
			console.log (str);
			return false;
		}

		this.metric = getDistanceMetric ();
		this._busy = false;
		return true;
	}

	handleSceneChange ()
	{
		this._combats = new Map ();
		this._busy = false;
	}
	
	addCombatant (combatId_, id_)
	{
		this.combats.get (combatId_).set (id_, new Mook (canvas.tokens.get (id_), this.metric));
	}

	deleteCombatant (combat_, id_)
	{
		this.combats.get (combat_.id).delete (id_);
	}

	// Throws if there are no combats in the active scene
	async startCombats ()
	{
		game.combats.combats.forEach (c => { this.combatStart (c); });

		if (this._combats.size === 0)
		{
			ui.notifications.warn ("No combats in active scene.");
			throw "No combats in active scene";
		}

		// Work around for FVTT bug. game.combat.current is null when a scene is loaded
		await game.combat.previousTurn ();
		await game.combat.nextTurn ();
	}

	combatStart (combat_)
	{
		if (combat_.data.scene !== game.scenes.active.id)
			return;

		if (this.combats.get (combat_.id))
		{
			console.log ("mookAI | Attempted to start combat that is already active.");
			return;
		}

		let newMooks = new Map ();

		combat_.combatants.forEach (element => {
			const newToken = canvas.tokens.get (element.tokenId);

			if (! newToken)
			    return;

			newMooks.set (element.tokenId, new Mook (newToken, this.metric));
		});

		this._combats.set (combat_.id, newMooks);
	}

	combatEnd (combat_)
	{
		if (! this.combats.has (combat_.id))
		{
			console.log ("mookAI | Attempted to delete combat that does not exist.");
			return;
		}

		this.combats.delete (combat_.id);
	}

	async endTurn ()
	{
		return await game.combat.nextTurn ().catch (err => {
			ui.notifications.warn (err);
		});
	}

	getMook (id_)
	{
		const combat = this.combats.get (game.combat.id);

		if (! combat)
			return undefined;

		return combat.get (id_);
	}

	async takeTurn ()
	{
		try
		{
			// Throws if there is not combat on the *active* scene
			if (this._combats.size === 0)
				await this.startCombats ();

			this.applySettings ();

			const mook = this.getMook (game.combat.current.tokenId);
	
			if (! mook)
			{
				ui.notifications.warn ("mookAI | Mook not found. Are you viewing the active scene?");
				throw "Failed to find mook " + game.combat.current.tokenId + " in scene " + game.scenes.active.id;
			}
	
			if (mook.isPC ())
			{
				console.log ("mookAI | Not taking turn for player character");
				return;
			}
	
			this._busy = true;
	
			mook.startTurn ();
			await mook.sense ();
			mook.planTurn ();
			await mook.act ();
			mook.releaseControl ();
			this.endTurn ();
	
			this._busy = false;
		}
		catch (e)
		{
			if (! (e instanceof Abort))
			{
				console.error ("mookAI | Encountered unrecoverable error:");
				console.error (e);
			}

			this._busy = false;
		}
	}

	applySettings ()
	{
		this.changeMetric ();
	}

	changeMetric ()
	{
		const metric = getDistanceMetric ();

		if (this.metric === metric)
			return;
		
		this.metric = metric;
		this.combats.forEach ((mookMap, combatId) => {
			mookMap.forEach ((mook, mookId) => {
				this.addCombatant (combatId, mookId);
			});
		});
		
	}

	updateTokens (changes_)
	{
		this.combats.forEach (mooks => {
			mooks.forEach (m => { m.handleTokenUpdate (changes_); });
		});
	}

	// ;)
	get busy () { return this._busy; }

	get combats () { return this._combats; }
};

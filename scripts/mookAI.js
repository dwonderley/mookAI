import { Mook } from "./mook.js"

// Check if combat is active on startup
// When combat updates, add a mook for each npc in combat
// createCombat
// createCombatant

let mookAI;

export class MookAI
{
	constructor ()
	{
		this._busy = true;
		this._combats = new Map ();
	}

	static ready ()
	{
		if (mookAI)
			return;

		if (! game.user.isGM)
		{
			// todo: let heroes have mooks
			console.log ("mookAI | Heroes don't have mooks!");
			return;
		}

		mookAI = new MookAI ();

		Hooks.on ("updateToken", (scene_, token_, changes_, diff_, sceneID_) => {
			if (! diff_)
				return;
		
			mookAI.updateTokens (changes_);
		});

		Hooks.on ("createCombatant", (combat_, combatant_, obj_, id_) => {
			mookAI.addCombatant (combat_, combatant_.tokenId);
		});
		Hooks.on ("deleteCombatant", (combat_, combatant_, obj_, id_) => {
			mookAI.deleteCombatant (combat_, combatant_.tokenId);
		});
		Hooks.on ("createCombat", (combat_, obj_, id_) => {
			mookAI.combatStart (combat_);
		});
		Hooks.on ("deleteCombat", (combat_, obj_, id_) => {
			mookAI.combatEnd (combat_);
		});
		Hooks.on ("updateScene", (...args) => { mookAI.handleSceneChange () });

		document.addEventListener('keyup', evt => {
			if (evt.key !== 'b' || mookAI.busy)
				return;

			game.combat.previousTurn ();
		});

		document.addEventListener('keyup', evt => {
			if (evt.key !== 'n' || mookAI.busy)
				return;

			game.combat.nextTurn ();
		});

		if (game.modules.get("lib-pp")?.active)
		{
			document.addEventListener('keyup', evt => {
				if (evt.key !== 'g' || mookAI.busy)
					return;
	
				mookAI.takeTurn ();
			});
		}
		else
		{
			const str = "mookAI | Missing module dependency: Library - Path Planning. Please check that it is installed and enabled. mookAI cannot automate without it."
			ui.notifications.notify (str, "error", { "permanent": true });
			console.log (str);
			return;
		}

		mookAI._busy = false;

	}

	handleSceneChange ()
	{
		this._combats = new Map ();
		this._busy = false;
	}
	
	addCombatant (combat_, id_)
	{
		this.combats.get (combat_.id).set (id_, new Mook (canvas.tokens.get (id_)));
	}

	deleteCombatant (combat_, id_)
	{
		this.combats.get (combat_.id).delete (id_);
	}

	// Throws if there are no combats in the active scene
	async startCombats ()
	{
		game.combats.combats.forEach (c => { mookAI.combatStart (c); });

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

			newMooks.set (element.tokenId, new Mook (newToken));
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
			if (mookAI._combats.size === 0)
				await mookAI.startCombats ();

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
			console.error ("mookAI | Encountered unrecoverable error:");
			console.error (e);
			this._busy = false;
		}
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

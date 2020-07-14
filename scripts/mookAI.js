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
		game.combats.forEach (c => { mookAI.combatStart (c); });

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

		// todo: remove before uploading
		document.addEventListener('keyup', evt => {
			if (evt.key === 'h')
				printStuff ();
		});

		// todo: remove before uploading
		document.addEventListener('keyup', evt => {
			if (evt.key === 't')
				testStuff ();
		});

		document.addEventListener('keyup', evt => {
			if (evt.key === 'b')
				game.combat.previousTurn ();
		});

		document.addEventListener('keyup', evt => {
			if (evt.key === 'n')
				game.combat.nextTurn ();
		});

		document.addEventListener('keyup', evt => {
			if (evt.key === 'g')
				mookAI.takeTurn ();
		});
	}

	
	addCombatant (combat_, id_)
	{
		this.combats.get (combat_.id).set (id_, new Mook (canvas.tokens.get (id_)));
	}

	deleteCombatant (combat_, id_)
	{
		this.combats.get (combat_.id).delete (id_);
	}

	combatStart (combat_)
	{
		if (this.combats.get (combat_.id))
		{
			console.log ("mookAI | Attempted to start combat that is already active.");
			return;
		}

		let newMooks = new Map ();

		combat_.combatants.forEach (element => {
			newMooks.set (element.tokenId, new Mook (canvas.tokens.get (element.tokenId)));
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

	getMook (id_) { return this.combats.get (game.combat.id).get (id_); }

	async takeTurn ()
	{
		const mook = this.getMook (game.combat.current.tokenId);

		if (mook.isPC ())
		{
			console.log ("mookAI | Not taking turn for player character.");
			return;
		}

		mook.startTurn ();
		mook.sense ();
		mook.planTurn ();
		await mook.act ();
		mook.releaseControl ();
		this.endTurn ();
	}

	updateTokens (changes_)
	{
		this.combats.forEach (mooks => {
			mooks.forEach (m => { m.handleTokenUpdate (changes_); });
		});
	}

	get combats () { return this._combats; }
};

function testStuff ()
{
	const tokens = canvas.tokens.placeables.filter (e => { return e.name === "Actual PC"; })
	const girsula = mookAI.getMook (tokens[0].id);
	girsula.step ();
}

function printStuff ()
{
	const token = canvas.tokens.placeables.filter (e => { return e.name === "Actual PC"; });
	console.log (token[0].x, token[0].y);
}
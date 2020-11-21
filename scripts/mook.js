import { Behaviors, MookTypes, Target } from "./behaviors.js"
import { ActionType, MookModel } from "./mookModel.js";
import { PathManager } from "../../lib-find-the-path/scripts/pathManager.js";
import { PointFactory, SquareNeighborAngles, AngleTypes } from "../../lib-find-the-path/scripts/point.js";
import { FTPUtility } from "../../lib-find-the-path/scripts/utility.js";

export class Abort extends Error
{
	constructor (...params)
	{
		super (...params);
		if (Error.captureStackTrace) { Error.captureStackTrace (this, Abort) }
		this.name = "Abort"
	}
};

// Wrapper around FVTT token class
export class Mook
{
	constructor (token_, metric_)
	{
		this._token = token_;

		// Used to create Point objects
		this._pointFactory = new PointFactory (metric_);
		// Manages the mook's attempts at path planning
		this._pathManager = new PathManager (metric_);

		this._start = this._pointFactory.segmentFromToken (token_);
		this._segment = this._start;
		this._mookModel = MookModel.getMookModel (token_);
		this._targetedTokens = new Array ();
		this._visibleTargets = new Array ();
		// "time" represents how much a mook can do on their turn. Moving a tile costs 1 time unit by default.
		// todo: replace with a generalized cross-system resource manager (?!)
		this._time = this.mookModel.time;
		// Array of Actions
		this._plan = new Array ();

		this.utility= new FTPUtility ({
			token: token_,
			collisionConfig: { checkCollision: true, token: token_ }
		});

		this.debug = false;
	}

	startTurn ()
	{
		// Need to take control in order to check token's vision
		this.takeControl ();
		this.mookModel.startTurn ();

		this._start = this._pointFactory.segmentFromToken (this.token);
		this._segment = this._start;

		this._isExplorer = this.isExplorer;

		this.time = this.mookModel.time;
		this._visibleTargets.splice (0);
	}

	async sense ()
	{
		this.pathManager.clearAll ();

		this._visibleTargets = game.combat.combatants.filter (combatant => {
			// Even mooks won't target themselves on purpose
			if (combatant.tokenId === this.token.id) return false;

			const token = canvas.tokens.get (combatant.tokenId);

			// todo: add "factions" to allow targeting of npcs
			if (! this.isPC (token)) return false;
			// This shouldn't be possible
			if (! token.inCombat) return false;
			// Don't attack downed PCs
			if (this.mookModel.getCurrentHealth (token) <= 0) return false;
			// If the mook doesn't have vision, then it can see everyone. This choice avoids many problems.
			if (this.mookModel.hasVision && ! this.canSee (token.id)) return false;

			return true;
		}).map (c => { return canvas.tokens.get (c.tokenId); });

		// Todo: compute paths between tokens when one moves and then select paths here. 
		for (let t of this.visibleTargets)
			await this.pathManager.addToken (this.token, t, this.time);
	}

	planTurn ()
	{
		// Clear the previous plan
		this.plan.splice (0);

		if (this.visibleTargets.length === 0)
		{
			if (this.time < 1)
			{
				this.plan.push (this.mookModel.haltAction ());
				return;
			}

			this.plan.push ({ actionType: ActionType.EXPLORE });
			this.plan.push (this.mookModel.senseAction ());
			this.plan.push (this.mookModel.planAction ());
			return;
		}

		const targets = this.viableTargets;

		if (targets === null)
		{
			/*
			todo: move this into mook model.
			If mook can see a target but can't reach the target, then it should zoom if able (and if zooming will get it in range? what about multi-zoom)
			If mook cannot see target, but it is out of movement, it should zoom if able
			*/
			if (this.mookModel.canZoom)
			{
				const bonusTime = this.mookModel.zoom ();
				this.time += bonusTime;

				this.plan.push (this.mookModel.senseAction ());
				this.plan.push (this.mookModel.planAction ());
				return;
			}

			// If a mook can't find a target, they will explore to try to find one
			this.plan.push ({ actionType: ActionType.EXPLORE });
			this.plan.push (this.mookModel.senseAction ());
			this.plan.push (this.mookModel.planAction ());
			return;
		}

		// Of type Target
		const target = Behaviors.chooseTarget(this, targets);

		this.plan.push ({
			actionType: ActionType.TARGET,
			data: { "target": target.token },
		});

		const path = this.pathManager.path (this.token.id, target.id);

		if (path.valid)
			this.plan.push ({
				actionType: ActionType.TRAVERSE,
				cost: path.within (target.range).length - 1,
				data: { "path": path, "dist": target.range }
			});
		else
			this.plan.push ({
				actionType: ActionType.TRAVERSE,
				cost: 0,
				data: { "path": null, "dist": target.range }
			});

		this.plan.push (this.mookModel.faceAction (target.token));

		this.plan.push (target.attackAction);

		this.plan.push (this.mookModel.haltAction ());
	}

	async act ()
	{
		if (this.debug) console.log ("Acting");

		// todo: Setting to disable
		await this.centerCamera ();

		// todo: true timer
		let tries = 100;
		while (this.time >= 0 && --tries)
		{
			if (this.debug) console.log ("Try #%f", 100 - tries);

			if (this.plan.length === 0)
			{
				console.log ("mookAI | Planning failure: empty plan.");
				return;
			}

			if (this.plan.reduce (a => a?.cost) > this.time)
			{
				if (this.mookModel.canZoom)
				{
					this.time += this.mookModel.zoom ();
					continue;
				}

				console.log ("mookAI | Planning failure: too ambitious.");
				return;
			}

			let action = this.plan.splice (0, 1)[0];

			if (this.debug) console.log (action);

			switch (action.actionType)
			{
			case (ActionType.HALT):
				if (this.debug) console.log ("Halting");
				this.cleanup ();
				return;
			case (ActionType.SENSE):
				if (this.debug) console.log ("Sensing");
				await this.sense ();
				break;
			case (ActionType.PLAN):
				if (this.debug) console.log ("Planning");
				this.planTurn ();
				break;
			case (ActionType.ROTATE):
				if (this.debug) console.log ("Rotating");
				await this.rotate (action.data);
				break;
			case (ActionType.FACE):
				if (this.debug) console.log ("Rotating to face target");
				await this.rotate (this.degreesToTarget (action.data));
				break;
			case (ActionType.MOVE):
				if (this.debug)
					console.log ("Moving from (%f, %f) to (%f, %f)",
						     this.point.x, this.point.y, action.data.x, action.data.y);
				await this.move (action.data);
				break;
			// todo? Find a use for this
			// Open doors?
			case (ActionType.EXPLORE):
				if (this.isExploreDisabled)
					this.handleFailure (new Abort ("Not taking turn. Mook found no targets and exploration is disabled."));

				if (this.debug) console.log ("Exploring!?");

				if (! this._isExplorer)
				{
					let dialogPromise = new Promise ((resolve, reject) => {
						const dialog = new Dialog ({
							title: "Mook wants to explore!",
							content: "<p>The mook could not find a target. This could be because they don't have vision on a PC or because they are outside of weapon range.</p><p>The mook can explore their environment and try to find a target. Otherwise, mookAI will return control to the user.</p>",
							buttons: {
								approve: {
									label: game.i18n.localize ("Explore"),
									callback: () => { resolve (); }
								},
								reject: {
									label: game.i18n.localize ("Assume Direct Control"),
									callback: () => { reject (); }
								}
							},
							default: "approve",
							close: reject
						});
	
						dialog.render (true);
						dialog.position.top = 120;
						dialog.position.left = 120;
					});

					try {
						await dialogPromise;
					}
					catch (error)
					{
						this.handleFailure (new Abort ("Mook not exploring; out of actions."));
					}

					this._isExplorer = true;
				}

				const exploreActions = this.mookModel.exploreActions ();
				for (let i = 0; i < exploreActions.length; ++i)
					this.plan.splice (i, 0, exploreActions[i]);
				break;
			case (ActionType.TARGET):
				if (this.debug) console.log ("Targeting");
				this.target (action.data.target);
				break;
			case (ActionType.ATTACK):
				if (this.debug) console.log ("Attacking!");
				while (this.mookModel.canAttack) { await this.mookModel.attack (action); }
				break;
			case (ActionType.STEP):
				if (this.debug) console.log ("Stepping");
				if (! await this.step ())
					this.handleFailure (new Error ("Failed to take step"));
				break;
			case (ActionType.TRAVERSE):
				if (this.debug) console.log ("Traversing");

				if (action.cost > 0)
				{
					this.utility.path = action.data.path;
					this.utility.highlightPoints (action.data.path.path.map (s => s.origin));
				}

				let dialogPromise = new Promise ((resolve, reject) => {
					const dialog = new Dialog ({
						title: "Confirm Mook Action",
						content: "<p>Take action?</p>",
						buttons: {
							approve: {
								label: game.i18n.localize ("Approve"),
								callback: () => { resolve (); }
							},
							reject: {
								label: game.i18n.localize ("Reject"),
								callback: () => { reject (); }
							}
						},
						default: "approve",
						close: reject
					});

					dialog.render (true);
					dialog.position.top = 120;
					dialog.position.left = 120;
				});

				try {
					await dialogPromise;
				}
				catch (error)
				{
					this.handleFailure (new Abort ("User aborted plan"));
				}

				if (action.cost > 0)
				{
					this.utility.clearHighlights ();
					if (! await this.utility.traverse (action.data.dist, this.rotationDelay, this.moveDelay))
						this.handleFailure (new Error ("Failed to traverse path"));
				}
			}

			this.time -= action.cost ? action.cost : 0;
		}

		let str = "Unknown failure";

		if (tries <= 0)
			str = "mookAI | Planning failure: forced exit after too many loops.";
		if (this.time <= -1)
			str = "mookAI | Planning failure: mook took too many actions.";

		this.handleFailure (str);
	}

	inCombat () { return this.token.inCombat; }
	isPC (token_ = this.token) { return token_.actor.hasPlayerOwner; }

	handleTokenUpdate (changes_)
	{
		if (changes_._id !== this.token.id)
			return;

		this.segment.update (changes_);
	}

	cleanup ()
	{
		this.utility.clearHighlights ();
		this.clearTargets ();
		this.releaseControl ();
	}

	// Mooks don't have the emotional intelligence to handle failure :(
	// todo: teach mooks how to love themselves
	handleFailure (error_)
	{
		// todo: Undo all actions
		this.cleanup ();
		throw error_;
	}

	canSee (id_)
	{
		// I have no idea how this works, but it seems to anyway
		return canvas.tokens.children[0].children.some (e =>
			{ return e.id === id_ && e.isVisible; });
	}

	async centerCamera ()
	{
		const p = this._pointFactory.centerFromToken (this.token);
		await canvas.animatePan ({ x: p.px, y: p.py });
	}

	// Expects degrees
	async rotate (dTheta_)
	{
		await this.token.update ({ rotation: (this.rotation + dTheta_) % 360 });
		await new Promise (resolve => setTimeout (resolve, this.rotationDelay));
	}

	get viableTargets ()
	{
		let meleTargets = [];
		let rangedTargets = [];

		if (this.mookModel.hasMele)
			meleTargets = this.visibleTargets.filter (e => {
				return this.isTargetReachable (e, this.mookModel.meleRange)
			});

		if (this.mookModel.hasRanged)
			rangedTargets = this.visibleTargets.filter (e => {
				return this.isTargetReachable (e, this.mookModel.rangedRange)
			});

		if (meleTargets.length === 0 && rangedTargets.length === 0)
			return null;

		return { "mele": meleTargets, "ranged": rangedTargets };
	}

	/**
	 * @param {Token} target_
	**/
	degreesToTarget (target_)
	{
		const p1 = this._pointFactory.centerFromToken (this.token);
		const p2 = this._pointFactory.centerFromToken (target_);
		return p1.radialDistToPoint (p2, this.rotation, AngleTypes.DEG);
	}

	async move (segment_)
	{
		if (! this.utility.isTraversable (this.segment, segment_))
			return false;

		let error = false;

		await this.rotate (this.segment.radialDistToSegment (segment_, this.token.data.rotation, AngleTypes.DEG));
		await this.token.update ({ x: segment_.point.px, y: segment_.point.py }).catch (err => {
			ui.notifications.warn (err);
			error = true;
		});

		if (error) return false;

		this._segment = segment_;

		await this.centerCamera ();
		await new Promise (resolve => setTimeout (resolve, this.moveDelay));

		return true;
	}

	async step ()
	{
		const angles = this.neighborAngles.sort ((a, b) =>
		{
			return Math.min (a, 360 - a) - Math.min (b, 360 - b);
		});
		for (let angle of angles)
		{
			let success = await this.move (this.segment.neighbor (angle, this.rotation));
			if (success) return true;
		}

		return false;
	}

	isTargetReachable (target_, attackRange_)
	{
		return this.pathManager.path (this.token.id, target_.id).terminalDistanceToDest <= attackRange_;
	}

	takeControl () { this.token.control ({}); }
	releaseControl () { this.token.release ({}); }

	clearTargets ()
	{
		for (const t of this._targetedTokens)
			t.setTarget (false, { releaseOthers: true, groupSelection: false });

		this._targetedTokens = new Array ();
	}

	target (token_)
	{
		this._targetedTokens.push (token_);
		token_.setTarget (true, { releaseOthers: true, groupSelection: false });
	}

	get isExploreDisabled ()
	{
		const ret = game.settings.get ("mookAI", "DisableExploration");
		return (typeof ret === "boolean") ? ret : false;
	}

	get isExplorer ()
	{
		const ret = game.settings.get ("mookAI", "ExploreAutomatically");
		return (typeof ret === "boolean") ? ret : false;
	}

	get neighborAngles () { return Object.values (SquareNeighborAngles); }

	get mookModel () { return this._mookModel; } 

	get moveDelay ()
	{
		const ret = game.settings.get ("mookAI", "MoveAnimationDelay");
		if (ret < 0) return 0;
		if (ret > 1000) return 1000;
		return ret;
	}

	get pathManager () { return this._pathManager; } 

	get plan () { return this._plan; }

	get point () { return this._segment.point; }

	get rotation () { return this.token.data.rotation; }

	get rotationDelay ()
	{
		const ret = game.settings.get ("mookAI", "RotationAnimationDelay");
		if (ret < 0) return 0;
		if (ret > 1000) return 1000;
		return ret;
	}

	get segment () { return this._segment; }

	get time () { return this._time; }
	set time (speed_) { this._time = speed_; }

	get token () { return this._token; }

	get visibleTargets () { return this._visibleTargets; }
}

import { Behaviors, MookTypes, Target } from "./behaviors.js"
import { ActionType, MookModel } from "./mookModel.js";
import { PathManager, isTraversable } from "./planning/pathManager.js";
import { Point, getPointFromToken, getCenterPointFromToken, Neighbors, AngleTypes } from "./planning/point.js";

// Wrapper around FVTT token class
export class Mook
{
	constructor (token_)
	{
		this._token = token_;
		// todo: size?!
		this._point = getPointFromToken (token_);
		this._mookModel = MookModel.getMookModel (token_);
		this._visibleTargets = new Array ();
		// "time" represents how much a mook can do on their turn. Moving a tile costs 1 time unit by default.
		// todo: replace with a generalized cross-system resource manager (?!)
		this._time = this.mookModel.time;
		// Array of Actions
		this._plan = new Array ();
		// Manages the mook's attempts at path planning
		this._pathManager = new PathManager (this._mookModel);
	}

	startTurn ()
	{
		// Need to take control in order to check token's vision
		this.takeControl ();
		this.mookModel.startTurn ();

		this.time = this.mookModel.time;
		this._visibleTargets.splice (0);
	}

	async sense ()
	{
		this.pathManager.clear ();

		this._visibleTargets = game.combat.combatants.filter (combatant => {
			// Even mooks won't target themselves on purpose
			if (combatant.tokenId === this.token.id) return false;

			const token = canvas.tokens.get (combatant.tokenId);

			// todo: add "factions" to allow targeting of npcs
			if (! token.actor.isPC) return false;
			// This shouldn't be possible
			if (! token.inCombat) return false;
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
			this.mookModel.exploreActions ().forEach (a => {
				this.plan.push (a);
			});
			this.plan.push (this.mookModel.senseAction ());
			this.plan.push (this.mookModel.planAction ());
			return;
		}

		const targets = this.viableTargets;

		if (targets === null)
		{
			// todo: move resources such as number of attacks/actions to mook model
			/* todo: this may be inconsistent with above. Mooks don't zoom if there are no targets, but they do if there's one out of range? What if there's a target in range that they can't see yet? Should they explore before zooming? In 5e, probably, but does that hold for other systems?
			if (this.mookModel.canZoom)
			{
				this.time += this.mookModel.zoom ();

				// todo: dash actions and the like
				this.plan.push (this.mookModel.senseAction ());
				this.plan.push (this.mookModel.planAction ());
				return;
			} */

			// If a mook can't find a target, they will explore to try to find one
			this.mookModel.exploreActions ().forEach (a => {
				this.plan.push (a);
			});
			this.plan.push (this.mookModel.senseAction ());
			this.plan.push (this.mookModel.planAction ());
			return;
		}

		// Of type Target
		const target = Behaviors.chooseTarget(this, targets);

		this.plan.push ({
			actionType: ActionType.TARGET,
			data: { "target": target.token, "state": true },
		});

		this.pathManager.path (target.id).within (target.range).forEach (p => {
			console.log ("(%f, %f)", p.x, p.y);
			if (this.point.equals (p))
				return;

			this.plan.push ({
				actionType: ActionType.MOVE,
				cost: 1,
				data: p,
			});
		});

		this.plan.push (this.mookModel.faceAction (target.token));

		this.plan.push (target.attackAction);

		this.plan.push ({
			actionType: ActionType.TARGET,
			data: { "target": target.token, "state": false },
		});

		this.plan.push (this.mookModel.haltAction ());
	}

	async act ()
	{
		console.log ("Acting");

		// todo: Setting to disable
		await this.centerCamera ();

		// todo: true timer
		let tries = 100;
		while (this.time >= 0 && --tries)
		{
			console.log ("Try #%f", 100 - tries);

			if (this.plan.length === 0)
			{
				console.log ("mookAI | Planning failure: empty plan.");
				return;
			}

			if (this.plan.reduce (a => a?.cost) > this.time)
			{
				console.log ("mookAI | Planning failure: too ambitious.");
				return;
			}

			let action = this.plan.splice (0, 1)[0];
			console.log (action);

			switch (action.actionType)
			{
			case (ActionType.HALT):
				console.log ("Halting");
				return;
			case (ActionType.SENSE):
				console.log ("Sensing");
				await this.sense ();
				break;
			case (ActionType.PLAN):
				console.log ("Planning");
				this.planTurn ();
				break;
			case (ActionType.ROTATE):
				console.log ("Rotating");
				await this.rotate (action.data);
				break;
			case (ActionType.FACE):
				console.log ("Rotating to face target");
				await this.rotate (this.degreesToTarget (action.data));
				break;
			case (ActionType.MOVE):
				console.log ("Moving from (%f, %f) to (%f, %f)", this.point.x, this.point.y, action.data.x, action.data.y);
				await this.rotate (this.point.radialDistToPoint (action.data, this.rotation, AngleTypes.DEG));
				await this.move (action.data);
				break;
			// todo? Find a use for this
			case (ActionType.EXPLORE):
				console.log ("Exploring!?");
				break;
			case (ActionType.TARGET):
				console.log ("Targeting");
				this.setTarget (action.data.target, action.data.state);
				break;
			case (ActionType.MELE_ATTACK):
			case (ActionType.RANGED_ATTACK):
				console.log ("Attacking!");
				await this.mookModel.attack (action);
				break;
			case (ActionType.STEP):
				console.log ("Stepping");
				await this.step ();
				break;
			}

			this.time -= action.cost ? action.cost : 0;
		}

		if (tries <= 0)
			console.log ("mookAI | Planning failure: forced exit after too many loops.");
		if (this.time < 0)
			console.log ("mookAI | Planning failure: mook took too many actions.");
	}

	inCombat () { return this.token.inCombat; }
	isPC () { return this.token.actor.isPC; }

	/* Deprecated?
	// Todo: Customize distance function selection
	distToPoint (p_)     { return this.point.distToPoint (p_); }
	distToCoord (x_, y_) { return this.distToPoint (getPoint (x_, y_)); }
	distToToken (token_) { return this.distToCoord (token_.x, token_.y); }

	// Returns minimum rotation [-pi, pi] to face the token toward the
	// given point
	radialDistToPoint (p_, r_)
		{ return this.point.radialDistToPoint (p_, r_); }
	radialDistToCoord (x_, y_, r_) {
		return this.radialDistToPoint (getPoint (x_, y_), r_);
	}
	radialDistToToken (t_) {
		return this.radialDistToCoord (t_.x, t_.y, this.rotation);
	}
	*/

	handleTokenUpdate (changes_)
	{
		if (changes_._id !== this.token.id)
			return;

		const x = (changes_.x !== undefined) ? changes_.x : this.point.px;
		const y = (changes_.y !== undefined) ? changes_.y : this.point.py;
		// const w = (changes_.w !== undefined) ? changes_.w : this.point.width;
		// const h = (changes_.h !== undefined) ? changes_.h : this.point.height;

		this.point.update (x, y); //, w, h);
	}

	canSee (id_)
	{
		// I have no idea how this works, but it seems to anyway
		return canvas.tokens.children[0].children.some (e =>
			{ return e.id === id_ && e.isVisible; });
	}

	async centerCamera ()
	{
		const p = getCenterPointFromToken (this.token);
		await canvas.animatePan ({ x: p.px, y: p.py });
	}

	// Expects degrees
	async rotate (dTheta_)
	{
		console.log ("Rotating: %f", dTheta_);

		await this.token.update ({ rotation: (this.rotation + dTheta_) % 360 });
		await new Promise (resolve => setTimeout (resolve, 100));
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
		const point = getCenterPointFromToken (target_);
		return getCenterPointFromToken (this.token).radialDistToPoint (point, this.rotation, AngleTypes.DEG);
	}

	async move (point_)
	{
		if (! isTraversable (this.token, this.point, point_, true))
		{
			console.log ("mookAI | Cannot move between points (%f, %f) and (%f, %f)", this.point.x, this.point.y, point_.x, point_.y);
			console.log (this.point);
			console.log (point_);
			return false;
		}

		let error = false;

		await this.token.update ({ x: point_.px, y: point_.py }).catch (err => {
			ui.notifications.warn (err);
			error = true;
		});

		if (error) return false;

		this.point = point_;

		await this.centerCamera ();
		await new Promise (resolve => setTimeout (resolve, 500));
	}

	// The Point.neighbor method should work for different types of distance measures
	async step ()
	{
		await this.move (this.point.neighbor (Neighbors.forward, this.rotation));
	}

	isTargetReachable (target_, attackRange_)
	{
		console.log ("Checking reachability...");
		console.log (this.pathManager.path (target_.id).terminalDistanceToDest);
		console.log (attackRange_);
		return this.pathManager.path (target_.id).terminalDistanceToDest <= attackRange_;
	}

	releaseControl () { this.token.release ({}); }
	takeControl () { this.token.control ({}); }

	setTarget (token_, bool_)
	{
		token_.setTarget (bool_, { releaseOthers: true, groupSelection: false });
	}

	get mookModel () { return this._mookModel; } 

	get pathManager () { return this._pathManager; } 

	get plan () { return this._plan; }

	get point () { return this._point; }
	/**
	 * @param {Point} point_
	 */
	set point (point_) { this._point = point_; }

	get rotation () { return this.token.data.rotation; }

	get time () { return this._time; }
	set time (speed_) { this._time = speed_; }

	get token () { return this._token; }

	get visibleTargets () { return this._visibleTargets; }
}

import { Point, getPoint, getPointFromToken, Neighbors, deg2rad, rad2deg } from "./point.js";
import { ActionType, MookModel } from "./mookModel.js";
//import { Paths } from "./planning/paths.js";

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
		//this._paths = new Paths (this._mookModel.planningStrategy);
	}

	startTurn ()
	{
		// Need to take control in order to check token's vision
		this.takeControl ();

		this.time = this.mookModel.time;
		this._visibleTargets.splice (0);
	}

	sense ()
	{
		//this.paths.clear ();

		this._visibleTargets = game.combat.combatants.filter (combatant => {
			// Even mooks won't target themselves on purpose
			if (combatant.tokenId === this.token.id) return false;

			const token = canvas.tokens.get (combatant.tokenId);

			// todo: add "factions" to allow targeting of npcs
			if (! token.actor.isPC) return false;
			// This shouldn't be possible
			if (! token.inCombat) return false;
			// If the mook doesn't have vision, then it can see everyone. This choice avoids many problems.
			if (! this.mookModel.hasVision) return true;

			//this.paths.addToken (token);

			return this.canSee (token.id);
		}).map (c => { return canvas.tokens.get (c.tokenId); });
	}

	planTurn ()
	{
		// Clear the previous plan
		this.plan.splice (0);

		if (this.visibleTargets.length === 0)
		{
			console.log ("No visible targets");

			this.mookModel.exploreActions ().forEach (a => {
				this.plan.push (a);
			});
			// todo: combine these?
			this.plan.push (this.mookModel.senseAction ());
			this.plan.push (this.mookModel.planAction ());
			return;
		}

		const target = this.determineTarget ();
		console.log ("Target is: ");
		console.log (target);

		// If the mook can get into mele range, they will go for a mele attack
		// todo: Add range preference?
		if (this.mookModel.hasMele && this.isTargetReachable (target, this.mookModel.meleRange))
		{
			// todo: Replace with path path planning when I figure out how to do collision
			// The "origin" of an attack with 0 range is the target's location, itself
			let attackOrigin = getPointFromToken (target);

			// For each unit of range, the mook can be one time-unit further away from the target.
			// The process below finds the tile closest to the mook that is in range of the target.
			for (let i = 0; i < this.mookModel.meleRange; ++i)
			{
				// Mooks don't kite
				// todo: Add mook model setting to let mooks kite?
				if (this.point.equals (attackOrigin))
					break;

				attackOrigin = this.point.closestNeighborOfToken (attackOrigin, this.rotation);
			}

			this.plan.push ({
				actionType: ActionType.TARGET,
				data: { "target": target, "state": true },
			});

			if (! this.point.equals (attackOrigin))
				this.plan.push ({
					actionType: ActionType.MOVE,
					cost: this.distToPoint (attackOrigin),
					data: attackOrigin,
				});

			this.plan.push (this.mookModel.faceAction (target));

			this.plan.push (this.mookModel.meleAttackAction ());

			this.plan.push ({
				actionType: ActionType.TARGET,
				data: { "target": target, "state": false },
			});
		}
		else if (this.mookModel.hasRanged && this.isTargetReachable (target, this.mookModel.rangedRange))
		{
			console.log ("Ranged Rage!");

			this.plan.push ({
				actionType: ActionType.TARGET,
				data: { "target": target, "state": true }
			});

			// We know that this value is <= the mook's remaining time because it was checked above
			let distFromMaxRange = this.distToToken (target) - this.mookModel.rangedRange;

			while (distFromMaxRange-- > 0)
			{
				this.plan.push (this.mookModel.faceAction (target));
				this.plan.push (this.mookModel.stepAction ());
			}

			this.plan.push (this.mookModel.faceAction (target));
			this.plan.push (this.mookModel.rangedAttackAction ());

			this.plan.push ({
				actionType: ActionType.TARGET,
				data: { "target": target, "state": false },
			});
		}
		else
		{
			// If a mook cannot attack anyone, they will explore to try to find someone closer
			this.mookModel.exploreActions ().forEach (a => {
				this.plan.push (a);
			});
			this.plan.push (this.mookModel.senseAction ());
			this.plan.push (this.mookModel.planAction ());
		}

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

			let action = this.plan.splice (0, 1)[0];
			console.log (action);

			switch (action.actionType)
			{
			case (ActionType.HALT):
				console.log ("Halting");
				return;
			case (ActionType.SENSE):
				console.log ("Sensing");
				this.sense ();
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
				console.log ("Moving");
				await this.rotate (rad2deg (this.radialDistToPoint (action.data, this.rotation)));
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

	handleTokenUpdate (changes_)
	{
		if (changes_._id !== this.token.id)
			return;

		const x = (changes_.x !== undefined) ? changes_.x : this.point.px;
		const y = (changes_.y !== undefined) ? changes_.y : this.point.py;
		this.updatePoint (x, y);
	}

	updatePoint (x, y)
	{
		this.point.update (x,y);
	}

	canSee (id_)
	{
		// I have no idea how this works, but it seems to anyway
		return canvas.tokens.children[0].children.some (e =>
			{ return e.id === id_ && e.isVisible; });
	}

	async centerCamera ()
	{
		await canvas.animatePan ({ x: this.point.px, y: this.point.py });
	}

	// Expects degrees
	async rotate (dTheta_)
	{
		console.log ("Rotating: %f", dTheta_);

		await this.token.update ({ rotation: (this.rotation + dTheta_) % 360 });
		await new Promise (resolve => setTimeout (resolve, 500));
	}

	// There are many ways to pick a target, implemented below. The mook model chooses which one. Note that
	// choosing a target is done indepentently of the path planning. The two alternate, if necessary.
	// 1. Closest visible target (do not change targets)
	// 2. todo: Closest visible target on path (change targets while moving if they find a closer one).
	// 3. todo: Victimize (attack weakest PC)
	// 4. todo: Pack tactics (attack focused PC)
	determineTarget ()
	{
		// todo: && this.paths.hasPath (token.id);

		// Gets the nearest target
		let maxDist = Infinity;
		let maxRDist = Math.PI;
		let target = null;

		for (let t of this.visibleTargets)
		{
			const dist = this.distToToken (t);
			const rDist = Math.abs (this.radialDistToToken (t));

			if (dist > maxDist) continue;
			if (dist === maxDist && rDist > maxRDist) continue;

			target = t;
			maxDist = dist;
			maxRDist = rDist;
		}

		return target;
	}

	/**
	 * @param {token} target_
	**/
	degreesToTarget (target_)
	{
		const point = getPointFromToken (target_).center;
		return rad2deg (this.point.center.radialDistToPoint (point, this.rotation));
	}

	async move (point_)
	{
		this.point = point_;
		await this.token.update ({ x: point_.px, y: point_.py }).catch (err => {
			ui.notifications.warn (err);
		});
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
		return (this.time + attackRange_) >= this.distToToken (target_);
	}

	releaseControl () { this.token.release ({}); }
	takeControl () { this.token.control ({}); }

	setTarget (token_, bool_)
	{
		token_.setTarget (bool_, { releaseOthers: true, groupSelection: false });
	}

	get mookModel () { return this._mookModel; } 

	//get paths () { return this._paths; }

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

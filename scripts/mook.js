import { Point, getPoint, getPointFromToken, Neighbors, deg2rad, rad2deg } from "./point.js"
import { ActionType, MookModel } from "./mookModel.js"

// Wrapper around FVTT token class
export class Mook
{
	constructor (token_)
	{
		this._token = token_;
		// todo: size?!
		this._point = getPointFromToken (token_);
		this._mookModel = new MookModel (token_);
		this._visibleTargets = new Array ();
		// "time" represents how much a mook can do on their turn. Moving a tile costs 1 time unit by default.
		// todo: replace with a generalized cross-system resource manager (?!)
		this._time = this.mookModel.time;
		// Array of Actions
		this._plan = new Array ();
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
		this._visibleTargets = game.combat.combatants.filter (combatant => {
			// Even mooks won't target themselves on purpose
			if (combatant.tokenId === this.token.id) return false;

			const token = canvas.tokens.get (combatant.tokenId);

			// todo: add "factions" to allow targeting of npcs
			if (! token.actor.isPC) { return false; }
			// This shouldn't be possible
			if (! token.inCombat) { return false; }
			if (this.mookModel.hasVision) { return this.canSee (token.id); }
			return true;
		}).map (c => { return canvas.tokens.get (c.tokenId); });
	}

	planTurn ()
	{
		this.plan.splice (0);

		if (this.visibleTargets.length === 0)
		{
			this.mookModel.exploreActions.forEach (a => {
				this.plan.push (a);
			});
			// todo: combine these?
			this.plan.push (this.mookModel.senseAction);
			this.plan.push (this.mookModel.planAction);
			return;
		}

		const target = this.determineTarget ();

		// todo: Replace with path path planning when I figure out how to do collision
		// The "origin" of an attack with 0 range is the target's location, itself
		let attackOrigin = getPointFromToken (target);

		// If the mook is in mele range, they will go for a mele attack
		// todo: Add range preference?
		if (this.inMeleRange (target))
		{
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
					cost: this.distToToken (target),
					data: attackOrigin,
				});

			this.plan.push ({
				actionType: ActionType.ROTATE,
				cost: 0,
				data: this.degreesToTarget (target)
			});

			this.plan.push ({
				actionType: ActionType.ATTACK,
				data: this.mookModel.meleWeapon,
			});

			this.plan.push ({
				actionType: ActionType.TARGET,
				data: { "target": target, "state": false },
			});
		}
		else if (this.mookModel.hasRanged)
		{
			this.plan.push ({
				actionType: ActionType.TARGET,
				data: { "target": target, "state": true }
			});

			this.plan.push ({
				actionType: ActionType.ROTATE,
				cost: 0,
				data: this.degreesToTarget (target)
			});

			// todo: check that ranged weapon is actually in range
			this.plan.push ({
				actionType: ActionType.ATTACK,
				data: this.mookModel.rangedWeapon,
			});

			this.plan.push ({
				actionType: ActionType.TARGET,
				data: { "target": target, "state": false },
			});
		}
		else
		{
			// todo move mooks lacking ranged attacks
		}

		this.plan.push ({
			actionType: ActionType.HALT
		});
	}

	// todo: animate movement + rotating
	async act ()
	{
		console.log ("Acting");
		// todo: true timer
		let tries = 100;
		while (true && this.time > 0 && --tries)
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
			case (ActionType.MOVE):
				console.log ("Moving");
				await this.move (action.data);
				break;
			case (ActionType.EXPLORE):
				console.log ("Exploring!?");
				// Todo: let explore's data be an array of functions? Wouldn't have to pollute
				// ActionType with things like Step, but might cause repetitive code.
				break;
			case (ActionType.TARGET):
				console.log ("Targeting");
				this.setTarget (action.data.target, action.data.state);
				break;
			case (ActionType.ATTACK):
				console.log ("Attacking!");
				// todo: Do not force this dependency
				await MinorQOL.doMacroRoll (event, action.data.data.name).catch (err => {
					ui.notifications.warn (err);
				});
				break;
			case (ActionType.STEP):
				console.log ("Stepping");
				await this.step ();
				break;
			}

			this.time -= action.cost ? action.cost : 0;
		}

		console.log ("mookAI | Planning failure: forced exit after too many loops.");
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

	// Expects degrees
	async rotate (dTheta_)
	{
		await this.token.update ({ rotation: (this.rotation + dTheta_) % 360 });
	}

	async rotateRandom ()
	{
		await this.rotate ();
	}

	// There are many ways to pick a target, implemented below. The mook model chooses which one. Note that
	// choosing a target is done indepentently of the path planning. The two alternate, if necessary.
	// 1. Closest visible target (do not change targets)
	// 2. todo: Closest visible target on path (change targets while moving if they find a closer one).
	// 3. todo: Victimize (attack weakest PC)
	// 4. todo: Pack tactics (attack focused PC)
	determineTarget ()
	{
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
		return await this.token.update ({ x: point_.px, y: point_.py }).catch (err => {
			ui.notifications.warn (err);
		});
	}

	async step ()
	{
		await this.move (this.point.neighbor (Neighbors.forward, this.rotation));
	}

	inMeleRange (token_)
	{
		return (this.time + this.mookModel.meleRange) >= this.distToToken (token_);
	}

	releaseControl () { this.token.release ({}); }
	takeControl () { this.token.control ({}); }

	setTarget (token_, bool_)
	{
		token_.setTarget (bool_, { releaseOthers: true, groupSelection: false });
	}

	get mookModel () { return this._mookModel; } 

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

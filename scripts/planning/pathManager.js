import { Point, getPointFromToken } from "../point.js"

// Because apparently JS doesn't have this built in...
class PriorityQueue
{
	constructor ()
	{
		this.data = new Array ();
	}

	pop ()
	{
		return this.data.shift ();
	}

	push (item_)
	{
		for (let i = 0; i < this.data.length; ++i)
		{
			if (this.data[i].cost >= item_.cost)
			{	
				this.data.splice (i, 0, item_);
				return;
			}
		}

		this.data.push (item_);
	}

	get length () { return this.data.length; }
};

/*
 * @private
*/
class Node
{
	constructor (origin_, dest_, distTraveled_)
	{
		this.origin = origin_;
		this.dest = dest_;
		this.distTraveled = distTraveled_;
		this.distToDest = this.origin.distToPoint (this.dest);
		this.cost = this.distTraveled + this.distToDest;

		this.prev = null;
	}
};

export class Path
{
	/*
	 * @private
	 * @param {Point} origin_
	 * @param {Point} dest_
	 * @param {Token} mookToken_
	 * @param {MookModel} mookModel_
	*/
	constructor (data_)
	{
		this.origin = data_.origin;
		this.dest = data_.dest;
		this.mookToken = data_.mookToken;
		this.mookModel = data_.mookModel;
		this.pathLength = data_.maxLength;

		this._path = new Array ();
	}

	// A*
	async findPath ()
	{
		console.time ("A* Search");

		let frontier = new PriorityQueue ();
		let n = new Node (this.origin, this.dest, 0);
		frontier.push (n);

		while (frontier.length > 0)
		{
			n = frontier.pop ();

			if (n.distToDest === 0)
			{
				console.log ("Found path");
				console.timeEnd ("A* Search");
				break;
			}

			if (n.distTraveled >= this.pathLength)
			{
				console.log ("Failed to find path to goal state");
				console.timeEnd ("A* Search");
				break;
			}

			n.origin.neighbors ().filter (p => {
				return isTraversable (n.origin, p)
			}).map (p => {
				return new Node (p, n.dest, n.distTraveled + n.origin.distToPoint (p));
			}).forEach (node => {
				node.prev = n;
				frontier.push (node);
			});
		}

		this.unwind (n);
	}

	unwind (node_)
	{
		this._path = new Array ();

		console.log ("Starting unwinding");
		for (let n = node_; n !== null; n = n.prev)
		{
			console.log (n);
			this._path.unshift (n);
		}
	}

	// Returns a subpath from the origin to the point on the path with distance dist_ away from the target
	within (dist_)
	{
		return this._path.filter (e => { return e.distToDest >= dist_ }).map (n => { return n.origin; });
	}

	get terminalDistanceToDest () { return this.terminus?.distToDest; }

	get terminus ()
	{
		if (this._path.length === 0) return undefined;
		return this._path[this._path.length - 1];
	}
};

/*
Each mook has a PathManager, and each PathManager stores the path from the mook to each tracked token.
Tokens are tracked through the addToken method below. This map is cleared and repopulated during each sensing step.
Since the grids are 2d, I don't expect that path planning calculations will be excessive, but I'll keep an eye on it.
*/
export class PathManager
{
	constructor (mookModel_)
	{
		this.mookModel = mookModel_;
		// _paths: id -> Path
		this._paths = new Map ();
		this._point = undefined;
	}

	async addToken (mookToken_, target_, time_)
	{
		if (this._paths.has (target_.id))
		{
			console.log ("mookAI | Attempted to add existing token to path manager");
			return;
		}

		const p = new Path ({
			"origin": this._origin,
			"dest": getPointFromToken (target_),
			"mookToken": mookToken_,
			"mookModel": this.mookModel,
			"maxLength": time_,
		});

		await p.findPath ();

		this._paths.set (target_.id, p);
	}

	// todo: Mook movement happens one square at a time. It should be possible to iterate over the set of paths and reassess which are valid. I'm also not sure that would save time.
	clear ()
	{
		this._paths.clear ();
	}

	path (id_) { return this._paths.get (id_);}

	get paths () { return this._paths; }

	/**
	 * The path manager treats this point as the origin. It must be updated before adding tokens.
	 * @param {Point} point_
	 */
	set origin (point_) { this._origin = point_; }
};

/*
* @param {Token} start_
* @param {Point} point_
*/
export function isTraversable (start_, point_)
{
	// todo: option: allow mooks to stack
	// todo: option: allow mooks to move through allied squares
	// If there's a token in that tile, the tile is not traversable
	canvas.tokens.placeables.forEach (token => {
		const p = getPointFromToken (token);
		if (point_.x === p.x && point_.y === p.y)
			return false;
	});

	// Taken from FVTT source
	const ray = new Ray({ x: start_.cpx, y: start_.cpy }, { x: point_.cpx, y: point_.cpy });
	return ! canvas.walls.checkCollision (ray);
}

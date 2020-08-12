import { Point, getPointFromToken, getPointSetFromToken, getPointSetFromCoord, getTokenHeight, getTokenWidth } from "./point.js"

// Because apparently JS doesn't have this built in...
/*
 * @private
*/
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
			const curElement = this.data[i];

			if (curElement.cost > item_.cost)
			{	
				this.data.splice (i, 0, item_);
				return;
			}
			if (curElement.cost === item_.cost)
			{
				// Prefer nodes closer to the goal
				if (curElement.distToDest > item_.distToDest)
				{
					this.data.splice (i, 0, item_);
					return;
				}
				if (curElement.distToDest < item_.distToDest)
					continue;

				const p1 = curElement.prev.origin;
				const p2 = curElement.origin;

				const p3 = item_.prev.origin;
				const p4 = item_.origin;

				const delta1 = Math.abs (p2.x - p1.x) + Math.abs (p2.y - p1.y);
				const delta2 = Math.abs (p4.x - p3.x) + Math.abs (p4.y - p3.y);

				// If the remaining distance is the same, prefer the one with less displacement. This only comes up in grids 8-tile movement with uniform movement costs
				if (delta1 > delta2)
				{
					this.data.splice (i, 0, item_);
					return;
				}
				if (delta1 < delta2)
					continue;

				function calcCross (start_, current_, dest_)
				{
					const dx1 = start_.x - dest_.x;
					const dy1 = start_.y - dest_.y;
					const dx2 = current_.x - dest_.x;
					const dy2 = current_.y - dest_.y;

					return Math.abs (dx1 * dy2 - dx2 * dy1);
				}

				const cross1 = calcCross (p1, p2, curElement.dest);
				const cross2 = calcCross (p3, p4, item_.dest);

				// If the displacement is the same, prefer the one with a smaller cross-product
				if (cross1 >= cross2)
				{
					this.data.splice (i, 0, item_);
					return;
				}
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
	constructor (originSet_, destSet_, distTraveled_)
	{
		this.originSet = originSet_;
		this.destSet = destSet_;
		this.distTraveled = distTraveled_;
		this.distToDest = Math.min (...this.originSet.map (p1 => {
			return Math.min (...this.destSet.map (p2 => p1.distToPoint (p2)));
		}));
		this.cost = this.distTraveled + this.distToDest;

		this.prev = null;
	}

	// Tokens of all sizes are represented by their upper-left point (index 0), a width, and a height
	get dest ()
	{
		return this.destSet[0];
	}

	// Tokens of all sizes are represented by their upper-left point (index 0), a width, and a height
	get origin ()
	{
		return this.originSet[0];
	}

	// Since all points in a set move as one, we can represent the entire collection with a single id
	get id ()
	{
		let text = "";
		text += this.origin.x + "," + this.origin.y;

		if (! this.prev)
			return text;
		
		return text + "," + this.prev.origin.x + "," + this.prev.origin.y;
	}
};

export class Path
{
	/*
	 * @private
	 * @param {Array<Point>} originSet_
	 * @param {Array<Point>} destSet_
	 * @param {Token} mookToken_
	 * @param {MookModel} mookModel_
	*/
	constructor (data_)
	{
		this.originSet = data_.originSet;
		this.destSet = data_.destSet;
		this.mookToken = data_.mookToken;
		this.mookModel = data_.mookModel;
		this.pathLength = data_.movement;

		this.tokenWidth = getTokenWidth (this.mookToken);
		this.tokenHeight = getTokenHeight (this.mookToken);

		this._path = new Array ();
	}

	// A*
	async findPath ()
	{
		console.time ("A* Search");

		let frontier = new PriorityQueue ();
		let visited = new Map ();
		let n = new Node (this.originSet, this.destSet, 0);

		frontier.push (n);

		while (frontier.length > 0)
		{
			n = frontier.pop ();

			if (n.prev && ! los (this.mookToken, n.prev.origin, n.origin))
				continue;

			if (n.distToDest === 0)
			{
				console.timeEnd ("A* Search");
				console.log ("Found path");
				break;
			}

			// todo: use mook model to determine if collision matters
			// Tokens with size > 1 have overlap when they move. We don't want them to colide with themselves
			if (n.prev && n.originSet.filter (p => {
				return ! n.prev.originSet.some (pp => pp.equals (p));
			}).some (p => collision (this.mookToken, p, true)))
			{
				continue;
			}

			if (n.distTraveled > this.pathLength)
			{
				console.timeEnd ("A* Search");
				console.log ("mookAI | Failed to find path to goal state");
				// This is the first node that is out of range, so the previous node was valid
				// todo: This won't hold because of tokens moving through other tokens' spaces
				n = n.prev;
				break;
			}
 
			// Since the goal point is checked for all points in the origin set against all points in the dest set, we only need to expand the origin node.
			n.origin.neighbors ().map (p => {
				let node = new Node (getPointSetFromCoord (p.x, p.y, this.tokenWidth, this.tokenHeight),
						     n.destSet,
						     n.distTraveled + 1);
				node.prev = n;
				return node;
			}).filter (node => {
				const id = node.id;

				if (visited.has (id))
					return false;

				visited.set (id, 1);
				return true;
			}).forEach (node => {
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

	get cost () { return this?.terminus.cost; }

	get terminalDistanceToDest () { return this.terminus?.distToDest; }

	get terminus ()
	{
		if (this._path.length === 0) return undefined;
		return this._path[this._path.length - 1];
	}

	get length () { return this._path.length; }
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

	static pathBetweenPoints (origin_, dest_)
	{
	}

	async addToken (mookToken_, target_, movement_)
	{
		if (this._paths.has (target_.id))
		{
			console.log ("mookAI | Attempted to add existing token to path manager");
			return;
		}

		const p = new Path ({
			"originSet": getPointSetFromToken (mookToken_),
			"destSet": getPointSetFromToken (target_),
			"mookToken": mookToken_,
			"mookModel": this.mookModel,
			"movement": movement_,
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
};

/*
* @param {Token} start_
* @param {Point} point_
*/
export function isTraversable (token_, oldPoint_, newPoint_, collisionMatters_)
{
	return los (token_, oldPoint_, newPoint_)
	       && ! collision (token_, newPoint_, collisionMatters_);
}

function los (token_, oldPoint_, newPoint_)
{
	if (! oldPoint_ || oldPoint_ === newPoint_)
		return true;

	const w = getTokenWidth (token_);
	const h = getTokenHeight (token_);

	const ps1 = getPointSetFromCoord (oldPoint_.x, oldPoint_.y, w, h);
	const ps2 = getPointSetFromCoord (newPoint_.x, newPoint_.y, w, h);
	
	for (let i = 0; i < w; ++i)
		for (let j = 0; j < h; ++j)
			if (canvas.walls.checkCollision (new Ray({ x: ps1[i].cpx (1), y: ps1[j].cpy (1)},
								 { x: ps2[i].cpx (1), y: ps2[j].cpy (1)})))
				return false;

	return true;
}

// todo: replace collisionMatters bool with function?
function collision (token_, newPoint_, collisionMatters_)
{
	if (! collisionMatters_)
		return false;

	for (let token of canvas.tokens.placeables)
	{
		if (token.id === token_.id)
			continue;

		if (getPointSetFromToken (token).some (p => newPoint_.equals (p)))
			return true;
	}

	return false;
}

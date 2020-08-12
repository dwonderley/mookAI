// todo: support hex

// The types of distance norms typical in tile-based games
const MinkowskiParameter =
{
	Manhattan: 1,
	Euclidean: 2,
	Chebyshev: Infinity,
}

// Relative degree offsets for neighboring *squares* in this bearing-based coordinate system
export const Neighbors =
{
	forward: 0,
	fRight: 45,
	right: 90,
	bRight: 135,
	backward: 180,
	bLeft: 225,
	left: 270,
	fLeft: 315,
}

export const AngleTypes =
{
	RAD: 0,
	DEG: 1,
}

export function getTokenWidth (token_)
{
	const scale = canvas.grid.size;

	let width = Math.floor (token_.w / scale);
	return width ? width : 1;
}

export function getTokenHeight (token_)
{
	const scale = canvas.grid.size;

	const height = Math.floor (token_.h / scale);
	return height ? height : 1;
}

// Returns a new Point from px and py offsets: top left corner of canvas to top left corner of tile, in pixels
export function getPoint (px_, py_)
{
	if (px_ < 0 || py_ < 0) return undefined;

	const scale = canvas.grid.size;
	return new Point (px_ / scale, py_ / scale, 0);
}

// Returns a new Point from x and y offsets: top left corner of canvas to top left corner of tile, in grid squares
export function getPointFromCoord (x_, y_)
{
	if (x_ < 0 || y_ < 0) return undefined;

	return new Point (x_, y_, 0);
}

// A token with dimensions > 1x1 is represented by an array of points for the purposes of los, collision detection, and path planning. The top left point *must* be the first element of the array.
export function getPointSetFromCoord (x_, y_, w_, h_)
{
	let ret = new Array ();

	for (let i = 0; i < w_; ++i)
		for (let j = 0; j < h_; ++j)
			ret.push (getPointFromCoord (x_ + i, y_ + j));

	return ret;
}

// Returns a new Point using a token's position
export function getPointFromToken (token_)
{
	return getPoint (token_.x, token_.y);
}

export function getPointSetFromToken (token_)
{
	const origin = getPointFromToken (token_);

	return getPointSetFromCoord (origin.x, origin.y, getTokenWidth (token_), getTokenHeight (token_));
}

// Returns a new Point located at the center of... this point. 
export function getCenterPointFromToken (token_) { return getPoint (token_.x + token_.w / 2, token_.y + token_.h / 2); }

// Represents a token's position as a point in grid-space rather than pixel-space and provides some useful methods.
// Why does this class have a random val_ member that isn't used anywhere? I'm not sure, but I just have a feeling it will be
// useful one day...
export class Point
{
	constructor (x_, y_, val_) {
		// Number of tiles down (y) or right (x) of the top-left corner
		this._x = x_;
		this._y = y_;

		// todo: Could represent difficult terrain, elevation, tile type (square/hex)...
		this.val = val_;

		switch (game.system.id)
		{
		// D&D 5E uses the Chebyshev norm (adjacent + diagonals)
		// todo: global setting
		case ("dnd5e"):
			this._metric = MinkowskiParameter.Chebyshev;
		}
	}

	distToPoint (p_)     { return Point.lp (this, p_, this.metric); }
	distToCoord (x_, y_, w_, h_)
	{
		const p2 = getPointFromCoord (x_, y_);

		let points = new Array ();

		for (let i = 0; i < w_; ++i)
			for (let j = 0; j < h_; ++j)
				points.push (getPointFromCoord (this.x + i, this.y + j));

		return Math.min (...points.map (p1 => Point.lp (p1, p2, this.metric)));
	} 
	equals (p_)          { return this.x === p_.x && this.y === p_.y; }
	isNeighbor (p_)      { return this.distToPoint (p_) === 1; }

	// If a token is at point P with rotation r_, this function returns the relative neighbor of that token in
	// dir_ direction (e.g. forward, to the left, behind-left)
	neighbor (dir_, r_)
	{
		const theta = deg2rad (r_ + dir_);
		const dx = - Math.sin (theta);
		const dy = Math.cos (theta);

		if (this.metric === MinkowskiParameter.Chebyshev)
			return getPointFromCoord (Math.round (this.x + dx), Math.round (this.y + dy));

		// Otherwise, the token can only move adjacently. This means that it can only change either the x or y
		// coordinate. We will have it take the bigger movement

		const adx = Math.abs (dx);
		const ady = Math.abs (dy);

		if (adx > ady || (adx === ady && Math.random () > 0.5))
			return getPointFromCoord (this.x + Math.sign(dx), this.y);

		return getPointFromCoord (this.x, this.y + Math.sign(dy));
	}

	// Gets all of this point's neighbors
	// This isn't particularly well-defined for the Euclidean metric
	neighbors ()
	{
		let n = new Array ();

		const pushIfDefined = (vector_, dx_, dy_) =>
		{
			const p = getPointFromCoord (this.x + dx_, this.y + dy_);
			if (p) vector_.push (p);
		}

		pushIfDefined (n, -1, 0);
		pushIfDefined (n, 1, 0);
		pushIfDefined (n, 0, -1);
		pushIfDefined (n, 0, 1);

		if (this.metric == MinkowskiParameter.Chebyshev)
		{
			pushIfDefined (n, -1, -1);
			pushIfDefined (n, -1, 1);
			pushIfDefined (n, 1, -1);
			pushIfDefined (n, 1, 1);
		}

		return n
	}

	// For a rotation_, find the neighboring Point of a target that is closest to this Point
	closestNeighborOfToken (target_, rotation_)
	{
		let maxDist = Infinity;
		let maxRDist = Math.PI;
		let closestNeighbor;

		for (let n of getPointFromCoord (target_.x, target_.y).neighbors ())
		{
			const dist = Point.Euclidean(this, n);
			const rDist = Math.abs (this.radialDistToPoint (n, rotation_));

			if (dist > maxDist) continue;
			if (dist === maxDist && rDist > maxRDist) continue;

			closestNeighbor = n;
			maxDist = dist;
			maxRDist = rDist;
		}

		return closestNeighbor;
	}

	// Returns the angle that, applied to a token with rotation r_, will orient the token toward Point p_
	// e.g. A token with rotation of 45 deg wants to rotate toward a tile one square below and to the right
	// of its current position ((dx, dy) = (+1, +1) wrt the grid). The angle from the token's position to the
	// target square is -45 deg (if that doesn't make sense to you, see comment below), so this function will
	// output -pi/2.
	// Bounded on [-pi, pi]
	radialDistToPoint (p_, r_, angleType_)
	{
		const M_2PI  = 2 * Math.PI;

		// This coordinte system is quite insane, graphics conventions be damned.
		// The x and y axes are flipped (angle starts from y)
		// The angle increase has inverse sign ((+x, +y) -> -theta)
		// The conversion (from Cartesian) is:
		// x -> -x
		// y -> +y
		// theta -> pi/2 - theta
		// E.g. atan2(y/x) -> -atan2(x/y) = atan2(-x/y)
		const dx = p_.x - this.x;
		const dy = p_.y - this.y;
		// Bounded between [-pi, pi]
		const angleToPoint = Math.atan2 (-dx, dy);

		// Bounded between [0, 2pi] (see deg2rad)
		const rotation = deg2rad ((r_ % 360) + 360);
		// Bounded between [-3PI, PI]
		const out = angleToPoint - rotation;
		// Return an an angle between [-pi, pi]
		const ret = out + (out < - Math.PI ? M_2PI : 0);

		if (angleType_ === AngleTypes.DEG)
			return rad2deg (ret);

		return ret;
	}

	radialDistToToken (token_, rotation_, angleType_)
	{
		return this.radialDistToPoint (getPointFromToken (token_), rotation_, angleType_);
	}

	// In JS, numbers are not references, so we have to update these when they change
	update (px_, py_, width_, height_)
	{
		this._x = px_ / this.scale;
		this._y = py_ / this.scale;

		/*
		const width = Math.floor (width_ / this.scale);
		this.width = width ? width : 1;
		const height = Math.floor (height_ / this.scale);
		this.height = height ? height : 1;
		*/
	}

	// Calculate the distance between Points p1 and p2 using the L-norm
	static lp (p1_, p2_, p_)
	{
		if (p_ === MinkowskiParameter.Chebyshev)
			return Point.Chebyshev (p1_, p2_);
		if (p_ === MinkowskiParameter.Manhattan)
			return Point.Manhattan (p1_, p2_);
		if (p_ === MinkowskiParameter.Euclidean)
			return Point.Euclidean (p1_, p2_);
		if (p_ <= 0)
			return undefined

		console.log ("mookAI | Using L_%f-norm?!", p_);
		// Why am I supporting this? Why are you using this? What hellish system are you implementing?
		return Math.pow (Math.pow (Math.abs (p1_.x - p2_.x), p_) + Math.pow (Math.abs (p1_.y - p2_.y), p_), 1/p);
	}
	// L_infinity-norm (i.e. DnD 5e's default distance metric)
	static Chebyshev (p1_, p2_)
	{
		return Math.max (Math.abs (p1_.x - p2_.x), Math.abs (p1_.y - p2_.y))
	};
	// L_1-norm
	static Manhattan (p1_, p2_)
	{
		return Math.abs (p1_.x - p2_.x) + Math.abs (p1_.y - p2_.y);
	}
	// L_2-norm
	static Euclidean (p1_, p2_)
	{
		return Math.hypot (p1_.x - p2_.x, p1_.y - p2_.y)
	};

	get x () { return this._x; }
	get y () { return this._y; }
	// x and y offset, in pixels
	get px () { return this.x * this.scale; }
	get py () { return this.y * this.scale; }
	// Returns the offset of the point's center, in pixels
	cpx (w_) { return (this.x + w_ / 2) * this.scale; }
	cpy (h_) { return (this.y + h_ / 2) * this.scale; }

	get scale () { return canvas.grid.size; }

	get metric () { return this._metric; }
	set metric (minkowskiParameter_) { this.metric = minkowskiParameter_; };
};

// Why is there no standard version of these?
export function deg2rad (deg_) { return (deg_ % 360) * Math.PI / 180; }
export function rad2deg (r_) { return (180 / Math.PI * r_) % 360 };
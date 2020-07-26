class Node
{
	constructor ()
	{
		this.traversable = false;
	}
}

export class Path
{
	constructor ()
	{
		this._isValid = false;
	}

	get isValid () { return this._isValid; };
}

export class PathManager
{
	constructor (strategy_)
	{
		// A wrapper around a bunch of path-planning data? cost function, goal function, utility function?
		this._strategy = strategy_;
		// _paths: id -> Path
		this._paths = new Map ();
	}

	addToken (token_, range_)
	{
		if (this._paths.has (token_.id))
		{
			console.log ("mookAI | Attempted to add existing token to path manager");
			return;
		}

		this._paths.set (token_.id, new Path (token_, range_, this._strategy));
	}

	// todo: I see no reason to clear the calculated paths (other than me being lazy). Mook movement happens one square at a time. It should be possible to iterate over the set of paths and reassess which are valid.
	clear ()
	{
		this._paths.clear ();
	}

	get hasPath (id_) { return this._paths.get (id_).isValid ();}
	get path (id_) { return this._paths.get (id_);}
};

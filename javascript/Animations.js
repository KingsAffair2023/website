/**
 * @class AnimParams
 *
 * @description Start and end parameters for an animation.
 */
class AnimParams
{
	/** @public {?Vec} */
	position;

	/** @public {?Vec} */
	size;

	/** @public {?Number} */
	rotation;



	/**
	 * @param {Vec|null} position
	 * @param {Vec|null} size
	 * @param {Number|null} rotation
	 */
	constructor ( position= null, size = null, rotation= null )
	{
		this.position = position;
		this.size = size;
		this.rotation = rotation;
		Object.freeze ( this );
	}
}



/**
 * @class CardAnim
 *
 * @description Forms the nodes of an animation dependency graph.
 */
class CardAnim
{

	/** @public {Object} */
	selection;

	/** @public {AnimParams[]|null} */
	startParams;

	/** @public {AnimParams[]|null} */
	endParams;

	/** @public {Object} */
	ease;

	/** @public {Number} */
	duration;

	/** @public {CardAnim[]} */
	dependsOn;

	/** @public {(function():void)|null} */
	callback;



	/**
	 * @param {Object} selection The D3 selection which the animation should act on.
	 * @param {AnimParams|AnimParams[]|null} startParams
	 * @param {AnimParams|AnimParams[]|null} endParams
	 * @param {Object} ease A D3 ease object, which describes the interpolation function for the animation.
	 * @param {Number} duration
	 * @param {CardAnim[]} [dependsOn = []] Any animations which the start of this animation depends on.
	 * @param {(function():void)|null} callback
	 */
	constructor (
		selection,
		startParams,
		endParams,
		ease, duration,
		dependsOn = [],
		callback = null )
	{
		/* Check array parameters */
		let arrayParams;
		if ( !startParams )
		{
			if ( !endParams ) arrayParams = false;
			else arrayParams = Array.isArray ( endParams );
		}
		else
		{
			arrayParams = Array.isArray ( startParams );
			if ( endParams && Array.isArray ( endParams ) !== arrayParams )
				throw new Error ( "CardAnim.constructor: startParams and endParams must both be an array, or both objects" );
		}

		/* Check cardinalities */
		if ( arrayParams )
			if ( ( startParams && selection.size () !== startParams.length ) || ( endParams && selection.size () !== endParams.length ) )
				throw new Error ( "CardAnim.constructor: Assertion 'selection.size () == startParams.length == endParams.length' failed" );

		/* Turn the animation parameters into arrays and set the attributes */
		this.selection = selection;
		this.startParams = startParams ? ( arrayParams ? startParams.slice () : new Array ( selection.size () ).fill ( startParams ) ) : null;
		this.endParams = endParams ? ( arrayParams ? endParams.slice () : new Array ( selection.size () ).fill ( endParams ) ) : null;
		this.ease = ease;
		this.duration = duration;
		this.dependsOn = dependsOn.slice ();
		this.callback = callback;
	}



	/**
	 * @description Animate the entire dependency tree.
	 *
	 * @param {Map<CardAnim, Promise<void>>} [promises = new Map ()] A map with SingleAnimation objects as keys, storing promises for their respective animations.
	 * @returns {Map<CardAnim, Promise<void>>} The updated promises map.
	 * @public
	 */
	animate ( promises= new Map () )
	{
		/* Ignore if we are already animating */
		if ( promises.has ( this ) )
			return promises;

		/* Create an array of animation promises that this node depends on */
		const depPromises = []
		for ( const dep of this.dependsOn )
		{
			dep.animate ( promises );
			depPromises.push ( promises.get ( dep ) );
		}

		/* Add the promise for this animation */
		promises.set ( this, Promise.all ( depPromises ).then ( () => this._animate () ) );
		return promises;
	}



	/**
	 * @param {CardAnim} anim
	 * @returns {CardAnim}
	 */
	followedBy ( anim )
	{
		anim.dependsOn.push ( this );
		return anim;
	}



	/**
	 * @param {CardAnim} anim
	 * @returns {CardAnim}
	 */
	addDependency ( anim )
	{
		this.dependsOn.push ( anim );
		return this;
	}



	/**
	 * @param {AnimParams|AnimParams[]|null} endParams
	 * @param {Object|null} [ease = null]
	 * @param {Number|null} [duration = null]
	 * @returns {CardAnim}
	 * @public
	 */
	continueTo ( endParams, ease= null, duration= null )
	{
		return new CardAnim (
			this.selection,
			null, endParams,
			ease ?? this.ease,
			duration ?? this.duration,
			[ this ]
		);
	}



	/**
	 * @param {Number} index
	 * @param {AnimParams|AnimParams[]|null} endParams
	 * @param {Object|null} [ease = null]
	 * @param {Number|null} [duration = null]
	 * @returns {CardAnim}
	 * @public
	 */
	singleContinueTo ( index, endParams, ease= null, duration= null )
	{
		return new CardAnim (
			this.selection.filter ( ( d, i ) => i === index ),
			null,
			endParams,
			ease ?? this.ease,
			duration ?? this.duration,
			[ this ]
		);
	}



	/**
	 * @param {function():void} f
	 */
	addCallback ( f )
	{
		const oldCallback = this.callback;
		this.callback = ( oldCallback ? () => { oldCallback (); f (); } : f );
		return this;
	}



	/**
	 * @description Actually perform the animation for this node.
	 * @private
	 */
	_animate ()
	{
		/* The return animation */
		let promise;

		/* Set the attributes of a selection */
		const applyAnimParams = selection => selection
				.style ( "left", function ( d ) { return d.position?.x != null ? d.position.x + "px" : this.style.left } )
				.style ( "top", function ( d ) { return d.position?.y != null ? d.position.y + "px" : this.style.top } )
				.style ( "width", function ( d ) { return d.size?.x != null ? d.size.x + "px" : this.style.width } )
				.style ( "height", function ( d ) { return d.size?.y != null ? d.size.y + "px" : this.style.height } )
				.style ( "transform", function ( d ) { return d.rotation != null ? "rotate(" + d.rotation + "deg)" : this.style.transform; } );

		/* Animate */
		if ( this.startParams )
			applyAnimParams ( this.selection.data ( this.startParams ).join () )
		if ( this.endParams )
			promise = applyAnimParams (
				this.selection.data ( this.endParams ).join ()
					.transition ()
					.duration ( this.duration )
					.ease ( this.ease ) )
				.end ();
		else promise = new Promise ( res => setTimeout ( res, this.duration ) );

		/* Add the callback and return */
		return promise.then ( () => { if ( this.callback ) this.callback (); } );
	}



	/**
	 * @param {Object} selection The D3 selection which the animation should act on.
	 * @param {Object} ease A D3 ease object, which describes the interpolation function for the animation.
	 * @param {Number} duration
	 * @param {CardAnim[]} [dependsOn = []] Any animations which the start of this animation depends on.
	 * @constructor
	 */
	static Delay ( selection, ease, duration, dependsOn = [] )
	{
		return new DelayAnim ( selection, ease, duration, dependsOn );
	}
}



/**
 * @class DelayAnim
 * @extends CardAnim
 *
 * @description An animation which performs no transition, but will still take some duration.
 */
class DelayAnim extends CardAnim
{
	/**
	 * @param {Object} selection The D3 selection which the animation should act on.
	 * @param {Object} ease A D3 ease object, which describes the interpolation function for the animation.
	 * @param {Number} duration
	 * @param {CardAnim[]} [dependsOn = []] Any animations which the start of this animation depends on.
	 */
	constructor ( selection, ease, duration, dependsOn = [] )
	{
		super ( selection, null, null, ease, duration, dependsOn );
	}

	/**
	 * @description Actually perform the animation for this node.
	 * @private
	 * @override
	 */
	_animate ()
	{
		return new Promise ( res => setTimeout ( res, this.duration ) )
			.then ( () => { if ( this.callback ) this.callback () } );
	}
}
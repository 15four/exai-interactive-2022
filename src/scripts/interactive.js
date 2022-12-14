/**
 * The Exai Bio Homepage Interactive.
 *
 * Pretty self-explanatory. Handles all state management, animation, etc. of the homepage interactive.
 * Go forth in the name of Valhalla.
 */

import { fabric } from 'fabric';

import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin( ScrollTrigger );

import { qs, qsa, $on, randInRange, mergeObj, normalizeBoundingRect, transformBoundingRect, getLabelTime } from './utils';

export default class ExaiInteractive {

	/* ------------------------------------------------------ */
	/* Setup & Initialization ------------------------------- */
	/* ------------------------------------------------------ */

	/**
	 * Constructor.
	 *
	 * Creates the class and configures all of the configuration options.
	 * This helps us define things like the animation speeds, eases, etc. without editing code.
	 */
	constructor( config = {} ) {

		// User config

		const defaultConfig = {

			enabled                    : true,

			scrollLength               : 9,
			scrubFactor                : 0.5,

			snapScroll                 : true,
			snapDelay                  : 0.1,
			snapDurationMin            : 0.05,
			snapDurationMax            : 1.25,

			imageScaleFrom             : 1.075,
			imageScaleMax              : 1.035,
			imageScaleTo               : 1.035,

			rainbowImageOpacityMin     : 0.35,
			rainbowImageOpacityMax     : 0.4,
			rainbowImageOpacityTo      : 1,

			shapeStrokeWidth           : 2,

			shapeToCount               : 0.5,

			shapeToXMin                : 0.05,
			shapeToXMax                : 0.75,
			shapeToYMin                : 0.05,
			shapeToYMax                : 0.666,

			shapeScaleToMin            : 0.75,
			shapeScaleToMax            : 0.833,
			focalPointScaleToMax       : 1.5,

			shapeRotateFromMin         : 0,
			shapeRotateFromMax         : 30,
			shapeRotateToMin           : 5,
			shapeRotateToMax           : 70,

			shapeExpandStagger         : 0.125,
			shapeSnapStagger           : 0.05,

			stageInDuration            : 0.15,
			stageOutDelay              : 4,
			stageOutDuration           : 0.15,

			textComponentStagger       : 0.5,
			textComponentChildStagger  : 0.25,
			lettersDuration            : 0.666,
			lettersStagger             : 0.06,
			headingLettersStagger      : 0.06,
			bodyLettersStagger         : 0.0055,
			scrollPromptLettersStagger : 0.0055
		};

		this.config = mergeObj( defaultConfig, config );

		// Internal config

		this.blockClassName       = 'exai-interactive';
		this.dynamicComponents    = ['header', 'body'];
		this.stageCount           = 5;
		this.focalPointShapeIndex = 18;

		this.colors = {
			white        : '#ffffff',
			seaCrystal   : '#60fcde',
			auroraPurple : '#a259ff',
			hotCoral     : '#f2336a'
		};

		this.strokeWidthKey         = '_exaiStrokeWidth';
		this.scaleKey               = '_exaiScale';
		this.cacheBusterKey         = '_exaiCacheBuster';
		this.tweenNullTarget        = { value: 0 };
	}

	/**
	 * Initializer.
	 *
	 * Queries up the immutable variables needed under the hood.
	 * Fires off functionality if and only if the needed elements exist on the DOM.
	 */
	init() {

		if ( ! this.config.enabled ) {
			return;
		}

		this.selector        = `.${this.blockClassName}`;
		this.element         = qs( this.selector );
		this.interactive     = qs( `${this.selector}__interactive`, this.element );
		this.backgroundSizer = qs( `${this.selector}__background-sizer`, this.element );

		if ( this.element ) {

			// We use events here to ensure sequencing.
			// Browsers sometimes do things out of order when they aren't chained to event callbacks.

			$on( window, 'dynamicContentSetupComplete', this.setupAnimations.bind( this ) );
			$on( window, 'animationSetupComplete', this.createTheSacredTimeline.bind( this ) );
			$on( window, 'resize', this.handleResize.bind( this ) );

			this.setupDynamicContent();
		}
	}

	/**
	 * Sets up the dynamic content.
	 *
	 * Copies content from the setup bits to the interactive bits.
	 */
	setupDynamicContent() {

		// Copy the content specified in the setup bit to the interactive bit.

		const setupStages      = qsa( `${this.selector}__setup-stage`, this.element );
		this.dynamicContainers = this.dynamicComponents.map( ( componentType ) => qs( `${this.selector}__${componentType}-container`, this.element ) );

		for ( let setupStageIndex = 0; setupStageIndex < this.stageCount; setupStageIndex++ ) {

			for ( const [componentIndex, component] of this.dynamicComponents.entries() ) {

				const stageComponent = setupStages[setupStageIndex].children.item( componentIndex );

				if ( ! stageComponent ) {
					break;
				}

				const stageDynamicComponent = document.createElement( 'div' );
				stageDynamicComponent.classList.add( `${this.blockClassName}__dynamic-component` );
				stageDynamicComponent.classList.add( `${this.blockClassName}__dynamic-${component}` );

				for ( const child of stageComponent.children ) {
					stageDynamicComponent.appendChild( child.cloneNode( true ) );
				}

				this.dynamicContainers[componentIndex].appendChild( stageDynamicComponent );
			}
		}

		// Create the progress indicators.
		// First and last stages don't have them, so we chop 2 off the count.

		this.progress          = qs( `${this.selector}__progress`, this.element );
		this.progressStages    = [];
		this.progressStageBars = [];

		for ( let i = 0; i < this.stageCount - 2; i++ ) {

			const progressStage = document.createElement( 'div' );
			progressStage.classList.add( `${this.blockClassName}__progress-stage` );
			this.progressStages.push( progressStage );

			const progressStageBar = document.createElement( 'div' );
			progressStageBar.classList.add( `${this.blockClassName}__progress-stage-bar` );
			this.progressStageBars.push( progressStageBar );

			progressStage.appendChild( progressStageBar );
			this.progress.appendChild( progressStage );
		}

		// Push this event to the next tick.
		// Sometimes layout shifting of the content causes issues setting up the animation.

		window.setTimeout(
			() => window.dispatchEvent( new CustomEvent( 'dynamicContentSetupComplete' ) ),
			0
		);
	}

	/**
	 * Sets up animations.
	 *
	 * Creates references and calculates dimensions for elements that will animate.
	 * Both the background canvas and content pieces get set up here.
	 */
	setupAnimations() {

		gsap.config( { force3D: true } );
		ScrollTrigger.config( { ignoreMobileResize: true } );

		// Setting up the canvas ---------------------------- //

		// Create all of the references for background canvas entities.
		// These will be used to draw and animate later on.

		this.setupBackgroundImage   = qs( `${this.selector}__setup-background-image`, this.element );
		this.background             = qs( `${this.selector}__background`, this.element );
		this.focalPoint             = qs( `${this.selector}__focal-point`, this.background );
		this.shapeGuide             = qs( `${this.selector}__shape-guide`, this.element );
		this.shapes                 = qsa( `${this.selector}__shape`, this.shapeGuide );

		// We need to get the indices of all shapes that are going to be expandable.
		// To do this, we first remove the focal point shape.
		// We then shuffle the rest around and slice out as many as we need by a percentage fo the original length.

		this.expandableShapeIndices = Array.from( this.shapes.keys() )
			.filter( ( v ) => v !== this.focalPointShapeIndex )
			.sort( () => 0.5 - Math.random() )
			.slice( 0, Math.round( this.shapes.length * this.config.shapeToCount ) );

		const canvas      = qs( `${this.selector}__canvas`, this.element );
		this.fabricCanvas = new fabric.Canvas( canvas, { selection: false, enableRetinaScaling: false } );

		// It helps here to calculate and store off some often-needed numbers.
		// These are all to be stored as bounding rectangle objects.

		this.dimensions = {};
		this.ratios     = {};
		this.calculateDimensionsAndRatios();

		// Sizes the canvas render area to the size of the background

		this.fabricCanvas.setDimensions( { width: this.dimensions.background.width, height: this.dimensions.background.height } );

		// Define the styles.
		// These can be referenced and manipulated simultaneously by multiple drawables.

		this.styles = {};

		this.styles.rainbowGradient = new fabric.Gradient( {
			gradientUnits   : 'percentage',
			coords          : { x1 : -0.33, y1 : -0.33, x2 : 0.66, y2 : 1.33 },
			statefullCache  : true,
			cacheProperties : [this.cacheBusterKey],
			colorStops    : [
				{ offset: 0.666, color: this.colors.hotCoral },
				{ offset: 0.833, color: this.colors.auroraPurple },
				{ offset: 1, color: this.colors.seaCrystal },
			]
		} );

		// Then, the drawables.
		// These are the things that actually get drawn onto the canvas.

		this.drawables = {};

		// Start with the backgrounds and the images.

		this.drawables.rainbow = new fabric.Rect( { fill: this.styles.rainbowGradient, statefullCache: true, cacheProperties: [this.cacheBusterKey] } );

		const imageOptions = { originX: 'center', originY: 'center' };

		this.drawables.rainbowImage = new fabric.Image( this.setupBackgroundImage, imageOptions );
		this.drawables.rainbowImage[this.scaleKey] = 1;

		this.drawables.maskImage = new fabric.Image(
			this.setupBackgroundImage,
			mergeObj( imageOptions, { statefullCache: true, cacheProperties: [this.cacheBusterKey] } )
		);
		this.drawables.maskImage[this.scaleKey] = 1;

		// Then, tackle the mask and shapes.

		this.maskBackground = new fabric.Rect( { fill: 'transparent' } );
		this.drawables.mask = new fabric.Group( [this.maskBackground], { absolutePositioned: true } );

		this.maskShapes     = [];

		this.drawableShapes = [];

		const allShapeOptions      = { originX: 'center', originY: 'center' };
		const drawableShapeOptions = { fill: 'transparent', stroke: this.colors.white, strokeWidth: 0 };

		for ( let i = 0; i < this.shapes.length; i++ ) {

			let maskShape, shape;

			switch ( this.shapes[i].tagName.toLowerCase() ) {

				case 'circle':
					maskShape = new fabric.Circle( allShapeOptions );
					shape     = new fabric.Circle( mergeObj( allShapeOptions, drawableShapeOptions ) );
					break;

				case 'rect':
					maskShape = new fabric.Rect( allShapeOptions );
					shape     = new fabric.Rect( mergeObj( allShapeOptions, drawableShapeOptions ) );
					break;
			}

			maskShape[this.scaleKey] = 1;

			shape[this.strokeWidthKey] = 0;
			shape[this.scaleKey]       = 1;

			this.maskShapes.push( maskShape );
			this.drawables.mask.add( maskShape );

			this.drawables[`shape${i}`] = shape;
			this.drawableShapes.push( shape );
		}

		this.drawables.maskImage.clipPath = this.drawables.mask;

		// Add them all to the canvas at once.

		for ( const drawable of Object.values( this.drawables ) ) {
			this.fabricCanvas.add( drawable );
		}

		this.fabricCanvas.sendToBack( this.drawables.mask );

		// Setting up the other elements -------------------- //

		// Next, we have to create all of the references for other animatable entities.

		this.animatableContent = {};
		const splittableTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'];

		for ( const component of this.dynamicComponents ) {

			this.animatableContent[component] = [];
			const componentElements = qsa( `${this.selector}__dynamic-${component}`, this.element );

			for ( const componentElement of componentElements ) {

				const componentAnimatables = [];

				for ( const child of componentElement.children ) {

					if ( splittableTags.indexOf( child.tagName.toLowerCase() ) !== -1 ) {
						const splitText = new SplitText( child, { type: 'words, chars', lineThreshold: 0.5 } );
						componentAnimatables.push( splitText.chars );
					}
					else {
						componentAnimatables.push( child );
					}
				}

				this.animatableContent[component].push( componentAnimatables );
			}
		}

		// Using this same formula, we add the progress and scroll prompt too

		this.animatableContent.progress = this.progressStages;

		const scrollPromptText     = qs( `${this.selector}__scroll-prompt-text`, this.element );
		const scrollPromptSplitText = new SplitText( scrollPromptText, { type: 'words, chars', lineThreshold: 0.5 } );
		const scrollPromptArrow     = qs( `${this.selector}__scroll-prompt-arrow`, this.element );

		this.animatableContent.scrollPrompt = [scrollPromptSplitText.chars, scrollPromptArrow];

		window.dispatchEvent( new CustomEvent( 'animationSetupComplete' ) );
	}

	/* ------------------------------------------------------ */
	/* Animations ------------------------------------------- */
	/* ------------------------------------------------------ */

	/**
	 * Creates the sacred timeline.
	 *
	 * Stores all of the animation data for the whole interactive as well as their relative start/stop points.
	 * This is later scrubbed through on scroll to give us fine-grain control of things.
	 */
	createTheSacredTimeline() {

		// Creating the timeline object --------------------- //

		const snapScrollProps = {
			snapTo   : 'labelsDirectional',
			delay    : this.config.snapDelay,
			duration : { min: this.config.snapDurationMin, max: this.config.snapDurationMax }
		};

		//return;

		this.theSacredTimeline = gsap.timeline(	{
			onUpdate : this.handleUpdate.bind( this ),
			scrollTrigger : {
				trigger             : this.element,
				pin                 : true,
				end                 : () => `+=${this.dimensions.window.height * this.config.scrollLength}`,
				scrub               : this.config.scrubFactor,
				invalidateOnRefresh : true,
				// TODO: Figure out why snapping breaks on mobile
				// snap                : this.config.snapScroll ? snapScrollProps : false
			}
		} );

		// Setting initial states --------------------------- //

		// Start with the background and images

		this.theSacredTimeline.set(
			this.background,
			{ scale: this.config.imageScaleFrom }
		);

		this.theSacredTimeline.set(
			this.drawables.rainbow,
			{
				top     : () => this.dimensions.elementFromBackground.top,
				left    : () => this.dimensions.elementFromBackground.left,
				width   : () => this.dimensions.elementFromBackground.width,
				height  : () => this.dimensions.elementFromBackground.height,
				opacity : 0
			}
		);

		this.theSacredTimeline.set(
			this.getImages( [1, 1] ),
			{ opacity: 0, [this.scaleKey]: () => this.ratios.backgroundToImage }
		);

		// Then, the mask

		this.theSacredTimeline.set(
			[this.maskBackground, this.drawables.mask],
			{
				width  : () => this.dimensions.background.width,
				height : () => this.dimensions.background.height,
			}
		)

		// Then, do the mask shapes and regular shapes.
		// These get a little bit 'o randomization.

		for ( let i = 0; i < this.shapes.length; i++ ) {

			const maskShape = this.maskShapes[i];
			const shape     = this.drawableShapes[i];

			const allShapeProps = {
				opacity         : 0,
				[this.scaleKey] : 0,
				angle           : () => randInRange( this.config.shapeRotateFromMin, this.config.shapeRotateFromMax, true ),
			};

			const maskShapeProps = {
				top  : () => this.dimensions.focalPointFromBackground.cy - this.dimensions.background.halfHeight,
				left : () => this.dimensions.focalPointFromBackground.cx - this.dimensions.background.halfWidth
			};

			const drawableShapeProps = {
				top  : () => this.dimensions.focalPointFromBackground.cy,
				left : () => this.dimensions.focalPointFromBackground.cx,
			};

			if ( shape instanceof fabric.Circle ) {
				allShapeProps.radius = i === this.focalPointShapeIndex
					? () => this.dimensions.focalPointFromBackground.halfWidth
					: () => this.dimensions[`shape${i}FromBackground`].halfWidth

			}
			else if ( shape instanceof fabric.Rect ) {
				allShapeProps.width  = () => this.dimensions[`shape${i}FromBackground`].width;
				allShapeProps.height = () => this.dimensions[`shape${i}FromBackground`].height;
				allShapeProps.rx     = () => this.dimensions[`shape${i}FromBackground`].halfHeight;
				allShapeProps.ry     = () => this.dimensions[`shape${i}FromBackground`].halfHeight;
			}

			this.theSacredTimeline.set( maskShape, mergeObj( allShapeProps, maskShapeProps ) );
			this.theSacredTimeline.set( shape, mergeObj( allShapeProps, drawableShapeProps ) );
		}

		// Then, do the animatable content elements.
		// This includes the progress component and scroll prompt stuff since it gets animated in as well

		this.theSacredTimeline.set(
			Object.values( this.animatableContent ).flat( 2 ),
			{ opacity: 0, rotationX: -60, perspective: 400, transformOrigin: '50% 100% -15' }
		);

		// Then, do the progress bars.

		this.theSacredTimeline.set(
			this.progressStageBars,
			{ scaleX: 0 }
		);

		// Setting up all the stage animations -------------- //

		for ( let i = 0; i < this.stageCount; i++ ) {

			this.currentStageBuild = i;
			this.currentTimelineBuild = gsap.timeline();

			const progressIn  = i === 1;
			const progressBar = i > 0 && i < this.stageCount - 1;
			const progressOut = i === this.stageCount - 2;

			const scrollPromptIn  = i === 0;
			const scrollPromptOut = i === 0;

			this.currentTimelineBuild.addLabel( `stage${i}In` );

			this.currentTimelineBuild.addLabel( `stage${i}ContentIn`, `stage${i}In+=${this.config.stageInDuration}` );
			this.addStageContentTween( `stage${i}ContentIn`, false, progressIn, scrollPromptIn );
			this.currentTimelineBuild.addLabel( `stage${i}Snap`, `>+=${this.config.stageOutDelay / 2}` );

			if ( i < this.stageCount - 1 ) {
				this.currentTimelineBuild.addLabel( `stage${i}ContentOut`, `>+=${this.config.stageOutDelay}` );
				this.addStageContentTween( `stage${i}ContentOut`, true, progressOut, scrollPromptOut );
			}

			this.currentTimelineBuild.addLabel( `stage${i}Out` );
			this.currentTimelineBuild.to( this.tweenNullTarget, { value: 1, duration: this.config.stageOutDelay } );

			if ( progressBar ) {
				const progressBarStartLabel = i === 1 ? `stage${i}ContentIn` : `stage${i}In`;
				this.addInBetweenTween( this.progressStageBars[i - 1], { scaleX: 1 }, progressBarStartLabel, 'end' )
			}

			this.theSacredTimeline.add( this.currentTimelineBuild );
		}

		this.currentStageBuild = null;
		this.currentTimelineBuild = this.theSacredTimeline;

		// Animating the background ------------------------- //

		this.addInBetweenTween( this.background, { scale: 1 }, 'stage0In', 'stage0Snap' );
		this.addInBetweenTween( this.drawables.rainbow, { opacity: 1 }, 'stage0In', 'stage0Snap' );
		this.addInBetweenTween( this.background, { scale: this.config.imageScaleTo }, 'stage3ContentOut', 'end' );

		// Animating the gradient stops --------------------- //

		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[0], { offset: 0 }, 'stage0In', 'stage0Out' );
		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[0], { offset: 0 }, 'stage0Out', 'stage1Out' );
		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[0], { offset: 0.125 }, 'stage1Out', 'stage2Out' );
		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[0], { offset: 0 }, 'stage2Out', 'stage3Out' );
		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[0], { offset: 0 }, 'stage3Out', 'end' );

		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[1], { offset: 0.5 }, 'stage0In', 'stage0Out' );
		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[1], { offset: 0.375 }, 'stage0Out', 'stage1Out' );
		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[1], { offset: 0.625 }, 'stage1Out', 'stage2Out' );
		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[1], { offset: 0.375 }, 'stage2Out', 'stage3Out' );
		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[1], { offset: 0.5 }, 'stage3Out', 'end' );

		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[2], { offset: 1 }, 'stage0In', 'stage0Out' );
		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[2], { offset: 0.875 }, 'stage0Out', 'stage1Out' );
		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[2], { offset: 1 }, 'stage1Out', 'stage2Out' );
		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[2], { offset: 0.875 }, 'stage2Out', 'stage3Out' );
		this.addInBetweenTween( this.styles.rainbowGradient.colorStops[2], { offset: 1 }, 'stage3Out', 'end' );

		// Animating the images ----------------------------- //

		this.addInBetweenTween( this.drawables.rainbowImage, { opacity: this.config.rainbowImageOpacityMin }, 'stage0In', 'stage0ContentIn' );
		this.addInBetweenTween( this.drawables.rainbowImage, { opacity: this.config.rainbowImageOpacityMax }, 'stage0ContentIn', 'stage1ContentOut' );
		this.addInBetweenTween( this.drawables.rainbowImage, { opacity: this.config.rainbowImageOpacityMin }, 'stage1ContentOut', 'stage2Out' );
		this.addInBetweenTween( this.drawables.rainbowImage, { opacity: this.config.rainbowImageOpacityMax }, 'stage2Out', 'stage3Snap' );
		this.addInBetweenTween( this.drawables.rainbowImage, { opacity: this.config.rainbowImageOpacityTo }, 'stage3Snap', 'end' );

		this.addInBetweenTween(
			this.getImages( [1, 1] ),
			{ [this.scaleKey]: () => this.ratios.backgroundToImage * this.config.imageScaleMax },
			'stage0Snap',
			'stage2Snap'
		);

		this.addInBetweenTween(
			this.getImages( [1, 1] ),
			{ [this.scaleKey]: () => this.ratios.backgroundToImage },
			'stage2Snap',
			'stage3Snap'
		);

		this.addInBetweenTween(
			this.getImages( [0, 1] ),
			{ opacity: 0 },
			'stage3In',
			'stage3Snap'
		);

		// Animating the shapes ----------------------------- //

		// Set up the opacity
		// This is so that they don't start rendering in a weird way before the images animate in.

		this.theSacredTimeline.set(
			[...this.getShapes( [1, 1] ), ...this.getImages( [0, 1] )],
			{ opacity: 1 },
			getLabelTime( this.theSacredTimeline, 'stage0ContentIn' )
		);

		// Expand the focal point

		this.addInBetweenTween( this.getShapes( [1, 1], this.focalPointShapeIndex ), { [this.scaleKey] : 1 }, 'stage0ContentOut', 'stage1Snap' );
		this.addInBetweenTween( this.getShapes( [1, 1], this.focalPointShapeIndex ), { [this.scaleKey] : this.config.focalPointScaleToMax }, 'stage1Snap', 'stage2Snap' );

		// Expand out the other shapes

		for ( const [i, index] of this.expandableShapeIndices.entries() ) {

			this.addInBetweenTween(
				this.getShapes( [1, 1], index ),
				{
					top             : () => `+=${randInRange( this.dimensions.shapeGuide.height * this.config.shapeToYMin, this.dimensions.shapeGuide.height * this.config.shapeToYMax, true )}`,
					left            : () => `+=${randInRange( this.dimensions.shapeGuide.width * this.config.shapeToXMin, this.dimensions.shapeGuide.width * this.config.shapeToXMax, true )}`,
					angle           : () => randInRange( this.config.shapeRotateToMin, this.config.shapeRotateToMax, true ),
					[this.scaleKey] : () => randInRange( this.config.shapeScaleToMin, this.config.shapeScaleToMax ),
				},
				'stage1Snap',
				'stage2Snap',
				this.config.shapeExpandStagger * i
			);
		}

		// Snapping them all into place

		for ( let i = 0; i < this.shapes.length; i++ ) {

			const startLabel = 'stage2Snap';
			const endLabel   = 'stage3Snap';
			const offset     = this.config.shapeSnapStagger * i;

			const allShapeProps = { angle: 0, [this.scaleKey]: 1 };

			const maskShapeProps = {
				top  : () => this.dimensions[`shape${i}FromBackground`].cy - this.dimensions.background.halfHeight,
				left : () => this.dimensions[`shape${i}FromBackground`].cx - this.dimensions.background.halfWidth
			};

			const drawableShapeProps = {
				top  : () => this.dimensions[`shape${i}FromBackground`].cy,
				left : () => this.dimensions[`shape${i}FromBackground`].cx
			};

			this.addInBetweenTween(	this.maskShapes[i], mergeObj( allShapeProps, maskShapeProps ), startLabel, endLabel, offset );
			this.addInBetweenTween(	this.drawableShapes[i], mergeObj( allShapeProps, drawableShapeProps ), startLabel, endLabel, offset );
		}

		// Adding their strokes

		for ( let i = 0; i < this.drawableShapes.length; i++ ) {

			this.addInBetweenTween(
				this.getShapes( [1], i ),
				{ [this.strokeWidthKey] : this.config.shapeStrokeWidth },
				'stage3In',
				'stage3Snap',
				this.config.shapeSnapStagger * i
			);
		}

		// Fading them out

		for ( let i = 0; i < this.shapes.length; i++ ) {

			const startLabel = 'stage3ContentOut';
			const endLabel   = 'stage4Snap';
			const offset     = this.config.shapeSnapStagger * i;

			const allShapeProps = {
				opacity         : 0,
				angle           : () => randInRange( this.config.shapeRotateToMin, this.config.shapeRotateToMax, true ),
				[this.scaleKey] : 0
			};

			const maskShapeProps = {
				top  : () => this.dimensions.focalPointFromBackground.cy - this.dimensions.background.halfHeight + randInRange( this.dimensions.shapeGuide.height * this.config.shapeToYMin ),
				left : () => this.dimensions.focalPointFromBackground.cx - this.dimensions.background.halfWidth + + randInRange( this.dimensions.shapeGuide.width * this.config.shapeToXMin )
			};

			const drawableShapeProps = {
				top  : () => this.dimensions.focalPointFromBackground.cy + randInRange( this.dimensions.shapeGuide.height * this.config.shapeToYMin ),
				left : () => this.dimensions.focalPointFromBackground.cx + randInRange( this.dimensions.shapeGuide.width * this.config.shapeToXMin )
			};

			this.addInBetweenTween( this.maskShapes[i], mergeObj( allShapeProps, maskShapeProps ), startLabel, endLabel, offset	);
			this.addInBetweenTween( this.drawableShapes[i], mergeObj( allShapeProps, drawableShapeProps ), startLabel, endLabel, offset	);
		}

		// Hoisting up the snap labels ---------------------- //

		for ( let i = 0; i < this.stageCount; i++ ) {
			this.theSacredTimeline.addLabel( `stage${i}Snap`, getLabelTime( this.theSacredTimeline, `stage${i}Snap` ) );
		}
	}

	/**
	 * Gets text content tweens for the currently building stage and adds them to the currently building timeline.
	 */
	addStageContentTween( startLabel, isOut = false, includeProgress = false, includeScrollPrompt = false ) {

		const props = {
			opacity   : isOut ? 0 : 1,
			rotationX : isOut ? 60 : 0,
			duration  : this.config.lettersDuration,
			stagger   : { each: 0 }
		};

		let order = [
			'header',
			'body',
			includeProgress ? 'progress' : null,
			includeScrollPrompt ? 'scrollPrompt' : null
		];
		order = isOut ? order.reverse() : order;
		order = order.filter( ( component ) => component );

		for ( const [i, componentName] of order.entries() ) {

			let animatableContent = this.dynamicComponents.includes( componentName ) ? this.animatableContent[componentName][this.currentStageBuild] : [this.animatableContent[componentName]];
			animatableContent = isOut ? animatableContent.slice().reverse() : animatableContent;

			props.stagger.each = this.config[`${componentName}LettersStagger`] || this.config.lettersStagger;
			const componentDelay = this.config.textComponentStagger * i;

			for ( let [n, animatableChild] of animatableContent.entries() ) {

				if ( Array.isArray( animatableChild ) && isOut ) {
					animatableChild = animatableChild.slice().reverse();
				}

				this.currentTimelineBuild.to(
					animatableChild,
					props,
					`${startLabel}+=${componentDelay + (this.config.textComponentChildStagger * n)}`
				);
			}
		}
	}

	/**
	 * Adds an in-between tween (lol) to the currently building timeline.
	 */
	addInBetweenTween( target, props, startLabel, endLabel, offset = 0 ) {

		props.duration = getLabelTime( this.currentTimelineBuild, endLabel )
			- getLabelTime( this.currentTimelineBuild, startLabel )
			- offset;

		this.currentTimelineBuild.to(
			target,
			props,
			getLabelTime( this.currentTimelineBuild, startLabel ) + offset
		);
	}

	/* ------------------------------------------------------ */
	/* Event Handling --------------------------------------- */
	/* ------------------------------------------------------ */

	/**
	 * Handles updating of the sacred timeline.
	 *
	 * Scales and centers images, busts shape image caches, then renders the canvas.
	 */
	handleUpdate() {

		this.bustCache( this.drawables.rainbow );
		this.bustCache( this.drawables.maskImage );

		for ( const image of this.getImages( [1, 1] ) ) {
			image.scale( image[this.scaleKey] );
			image.center();
		}

		for ( let i = 0; i < this.shapes.length; i++ ) {

			this.drawableShapes[i].scale( this.drawableShapes[i][this.scaleKey] );
			this.maskShapes[i].scale( this.maskShapes[i][this.scaleKey] );

			this.drawableShapes[i].set( 'strokeWidth', this.drawableShapes[i][this.strokeWidthKey] );
		}

		this.fabricCanvas.renderAll();
	}

	/**
	 * Handles resize events.
	 */
	handleResize() {

		this.calculateDimensionsAndRatios();
		this.fabricCanvas.setDimensions( { width: this.dimensions.background.width, height: this.dimensions.background.height } );
	}

	/* ------------------------------------------------------ */
	/* Helpers ---------------------------------------------- */
	/* ------------------------------------------------------ */

	/**
	 * Sets up, stores, and reconfigures helpful dimensions such as canvas size and viewport size.
	 *
	 * These come in handy for when we need to constantly reference them without blowing up the repaint cycle.
	 * It's also helpful to do this on resize.
	 */
	calculateDimensionsAndRatios() {

		// Dimensions

		this.dimensions.background = normalizeBoundingRect( this.background.getBoundingClientRect() );

		this.dimensions.window = normalizeBoundingRect( {
			x      : 0,
			y      : 0,
			top    : 0,
			right  : window.innerWidth,
			bottom : window.innerHeight,
			left   : 0,
			width  : window.innerWidth,
			height : window.innerHeight
		} );

		this.dimensions.element = normalizeBoundingRect( this.element.getBoundingClientRect() );
		this.dimensions.elementFromBackground = transformBoundingRect( this.dimensions.background, this.dimensions.element );

		this.dimensions.focalPoint = normalizeBoundingRect( this.focalPoint.getBoundingClientRect() );
		this.dimensions.focalPointFromBackground = transformBoundingRect( this.dimensions.background, this.dimensions.focalPoint );

		this.dimensions.shapeGuide = normalizeBoundingRect( this.shapeGuide.getBoundingClientRect() );
		this.dimensions.shapeGuideFromBackground = transformBoundingRect( this.dimensions.background, this.dimensions.shapeGuide );

		for ( let i = 0; i < this.shapes.length; i++ ) {

			this.dimensions[`shape${i}`]               = normalizeBoundingRect( this.shapes[i].getBoundingClientRect() );
			this.dimensions[`shape${i}FromBackground`] = transformBoundingRect( this.dimensions.background, this.dimensions[`shape${i}`] );
		}

		// Ratios

		this.ratios.backgroundToImage = this.dimensions.background.width / this.setupBackgroundImage.naturalWidth;
		this.ratios.imageToBackground = 1 / this.ratios.backgroundToImage;
	}

	/**
	 * Gets an array of drawable images.
	 */
	getImages( includes = [1], index = null ) {

		return this.getDrawables(
			[[this.drawables.rainbowImage], [this.drawables.maskImage]],
			includes,
			index
		);
	}

	/**
	 * Gets an array of drawable shapes.
	 */
	getShapes( includes = [1], index = null ) {

		return this.getDrawables(
			[this.drawableShapes, this.maskShapes],
			includes,
			index
		);
	}

	/**
	 * Gets an array of drawable items of similar nature.
	 */
	getDrawables( drawableTypes, includes = [1], index = null ) {

		const drawables = [];

		for ( const [i, drawableType] of drawableTypes.entries() ) {

			if ( includes[i] ) {

				if ( index !== null ) {
					drawables.push( drawableType[index] );
				}
				else {
					drawables.push( ...drawableType );
				}
			}
		}

		return drawables;
	}

	/* ------------------------------------------------------ */
	/* Utils ------------------------------------------------ */
	/* ------------------------------------------------------ */

	/**
	 * Busts a fabricJS object cache.
	 */
	bustCache( object ) {
		object[this.cacheBusterKey] = Math.random();
	}
}

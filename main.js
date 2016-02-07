/* Copyright:		© 2012 by Vitaly Gordon (rocket.mind@gmail.com)
 * Licensed under:	MIT
 */

var debug = false

//LogOverlay.init ()

XMLHttpRequestWithCORS = $aspect (XMLHttpRequest, {
										open: function (method, path, async) {
											return _.last (arguments).call (this, method, (!path.contains ('cors.io') &&
																			 			   !path.contains (window.location.host))
																								? ('http://cors.io/?u=' + path) : path, async) } })

Program = $prototype ({

	constructor: function (context, index, numStates, numSymbols, matrix) {
							this.index       = index
							this.numStates   = numStates
							this.numSymbols  = numSymbols
							this.matrix 	 = matrix || this.randomMatrix
							this.textureSize = 16
							this.buffer 	 = context.texture ({	width:  this.textureSize,
																	height: this.textureSize,
															    	data:   this.asByteArray }) },
	randomMatrix: $property (function () { var index = this.index

								return _.times (this.numStates,
											_.times.$ (this.numSymbols, function () {
																			return [Math.floor (this.index * 255),
																					_.random (255),
																					_.random (255),
																					_.random (255)] })) }),
	update: function (matrix) {
				this.matrix = matrix || this.matrix
				this.buffer.update (this.asByteArray) },

	randomize: function () { this.update (this.randomMatrix) },

	asByteArray: $property (function () {	var data    = []
											var texSize = this.textureSize

											for (var y = 0; y < texSize; y++) {
												for (var x = 0; x < texSize; x++) {
													data.push (this.matrix[Math.floor ((y / texSize) * this.numStates)]
																	      [Math.floor ((x / texSize) * this.numSymbols)]) } }
											return new Uint8Array (
														_.flatten (data)) }),
	mutate: function () {
		var arr  = this.matrix.random.random
		var idx = _.random (arr.lastIndex)
			arr[idx] = _.clamp (arr[idx] + (_.random (1) ? -1 : 1), 0, 255)

		this.update () } })


Life = $extends (Viewport, {

	constructor: function (cfg) {
		Viewport.call (this, cfg) },

	initGL: function () {

		_.extend (this, {

			/* shaders */
			convertColorsShader: this.shaderProgram ({
				vertex: 'simple-vs',
				fragment: 'convert-colors-fs',
				attributes: ['position'],
				uniforms: ['cells', 'transform']
			}),
			randomNoiseShader: this.shaderProgram ({
				vertex: 'cell-vs',
				fragment: 'cell-random-noise-fs',
				attributes: ['position'],
				uniforms: ['seed', 'seed2', 'seed3', 'screenSpace', 'gridSize']
			}),
			updateProgramShader: this.shaderProgram ({
				vertex: 'cell-vs-pixeloffset',
				fragment: 'update-program-fs',
				attributes: ['position'],
				uniforms: ['previousStep', 'screenSpace', 'program0', 'program1', 'program2', 'pixelOffset', 'numStates', 'numSymbols', 'seed', 'lifeDecrease']
			}),
			parametricBrushShader: this.shaderProgram ({
				vertex: 'cell-vs-pixeloffset',
				fragment: 'cell-brush-fs',
				attributes: ['position'],
				uniforms: ['cells', 'image',
					'brushPosition1', 'brushPosition2', 'brushSize', 'seed',
					'pixelSpace', 'screenSpace', 'pixelOffset', 'noise', 'fill', 'animate', 'hue']
			}),
			drawCellsShader: this.shaderProgram ({
				vertex: 'simple-vs',
				fragment: 'draw-cells-fs',
				attributes: ['position'],
				uniforms: ['cells', 'transform']
			}),
			downsampleShader: this.shaderProgram ({
				vertex: 'cell-vs',
				fragment: 'downsample-cells-fs',
				attributes: ['position'],
				uniforms: ['source', 'screenSpace', 't1', 't2']
			}),
			/* square mesh */
			square: this.vertexBuffer ({
				type: this.gl.TRIANGLE_STRIP,
				vertices: [
			         1.0,  1.0,  0.0,
			        -1.0,  1.0,  0.0,
			         1.0, -1.0,  0.0,
			        -1.0, -1.0,  0.0
		        ]
			}),
			/* buffers */
			cellBuffer: null, 												// current
			imageBuffer: this.texture 		({ width: 512, height: 512 }),
			cellBuffer1: this.renderTexture ({ width: 512, height: 512 }),	// back
			cellBuffer2: this.renderTexture ({ width: 512, height: 512 }),	// front

			//forkProgramsBufer: this.genRandomPrograms (4, 4),
			/* transform matrices */
			transform: new Transform3D (),
			screenTransform: new Transform3D (),
			/* changeable parameters */
			gridSize: 6,
			numStates: 2,
			numSymbols: 4,
			scrollSpeed: 0.0,
			brushSize: 64.0,
			brushColor: 0.0,
			paused: false,
			tolerance: 0.15,
			friends: 4,
			tx1: 0.0, ty1: 0.0, tx2: 0.0, ty2: 0.0,
			/* other stuff */
			firstFrame: true,
			frameNumber: 0,
			programs: [],
			activeProgram: 0,
		})

		for (var i = 0; i < 3; i++) {
			this.programs.push (new Program (this, [0.1, 0.4, 0.7][i], this.numSymbols, this.numStates)) }

		this.cellBuffer = this.cellBuffer1
		this.fillWithNothing ()
		this.initUserInput ()
		this.resetWithRandomPrograms ()
		this.fillWithImage ()

		window.setInterval (this.$ (this.mutatePrograms), 50)
	},

	mutatePrograms: function () {
		_.invoke (this.programs, 'mutate') },

	resetWithRandomPrograms: function () {
		this.resetCellBuffer ()
		this.randomizePrograms () },

	randomizePrograms: function () {
		_.invoke (this.programs, 'randomize') },

	initUserInput: function () {
		var removePrompt = function () {
			$('.draw-prompt').remove ()
			$(document).unbind ('mousedown', removePrompt)
		}
		$(document).mousedown (removePrompt)
		$(this.canvas).mousewheel ($.proxy (this.onZoom, this))
		$(this.canvas).mousedown ($.proxy (function (e) {
			if (!e.button) {
				this.onPaintStart (e)
			} else {
				this.onDragStart (e)
			}
		}, this))
		$(this.canvas).bind ('contextmenu', function (e) {
			e.preventDefault ()
		})
		$(window).keydown ($.proxy (function (e) {
			switch (e.keyCode) {
				case 18: /* alt */
					break;
				case 78: /* n */ this.setBrushType ('noise'); break;
				case 32: /* space */ this.paused = !this.paused; break;
				case 9 : /*	tab */ this.resetWithRandomPrograms ();  e.preventDefault (); break;
				case 13 : /* enter */ this.randomizePrograms ();  e.preventDefault (); break;
				case 27: /* esc */ this.fillWithImage ();  e.preventDefault (); break;// $('.controls .scroll-speed').slider ('value', this.scrollSpeed = 0); break;
			}
		}, this))
		$(window).resize ($.proxy (function () {
			var container = $('.viewport-container')
			var width = container.width (),
				height = container.height ()
			if (width >= this.cellBuffer.width && height >= this.cellBuffer.height) {
				this.resize (this.cellBuffer.width, this.cellBuffer.height)
			} else {
					this.resize (width, height)
			}
		}, this)).resize ()
	},
	hueToCSSColor: $raw (function (H) {
		var r = Math.max (0.0, Math.min (1.0, Math.abs (H * 6.0 - 3.0) - 1.0))
		var g = Math.max (0.0, Math.min (1.0, 2.0 - Math.abs (H * 6.0 - 2.0)))
		var b = Math.max (0.0, Math.min (1.0, 2.0 - Math.abs (H * 6.0 - 4.0)))
		return 'rgba(' + Math.round (r * 255) + ',' + Math.round (g * 255) + ',' + Math.round (b * 255) + ', 1.0)'
	}),
	resizeBuffers: function (w, h) {
		this.cellBuffer1.resize (w, h)
		this.cellBuffer2.resize (w, h)
		$(window).resize ()
		this.reset ('noise')
		this.updateTransform (new Transform3D ())
	},
	reset: function (type) {
		if (type == 'noise') {
			this.fillWithImage ()
			//this.fillWithRandomNoise ()
		} else {
			this.fillWithNothing ()
		}
	},
	eventPoint: $raw (function (e) {
		var offset = $(this.canvas).offset ()
		return [
			(e.clientX - offset.left) / (this.viewportWidth * 0.5) - 1.0,
			(offset.top - e.clientY) / (this.viewportHeight * 0.5) + 1.0, 0.0]
	}),
	onZoom: function (e) {
		var isMac = navigator.platform == 'MacIntel'
		var zoom = Math.pow (1.03, e.originalEvent.wheelDelta ?
			(e.originalEvent.wheelDelta / (isMac ? 360.0 : 36.0)) : -e.originalEvent.detail * (isMac ? 0.5 : 1.0))
		var origin = this.transform.applyInverse (this.eventPoint (e))
		this.updateTransform (this.transform.multiply (new Transform3D ()
			.translate (origin)
			.scale ([zoom, zoom, 1.0])
			.translate ([-origin[0], -origin[1], 0.0])))
	},
	getZoom: $raw (function () {
		return vec3.length (vec3.subtract (
				this.transform.apply ([0, 0, 0]),
				this.transform.apply ([1, 0, 0])))
	}),
	onDragStart: function (e) {
		this.isDragging = true
		var origin = this.transform.applyInverse (this.eventPoint (e))
		$(window).mousemove ($.proxy (function (e) {
			var point = this.transform.applyInverse (this.eventPoint (e))
			this.updateTransform (this.transform.translate ([point[0] - origin[0], point[1] - origin[1], 0.0]))
		}, this))
		$(window).mouseup ($.proxy (function () {
			this.isDragging = false
			$(window).unbind ('mouseup')
			$(window).unbind ('mousemove')
		}, this))
	},
	onPaintStart: function (e) {
		this.paintFrom = this.paintTo = this.eventPoint (e)
		this.eraseMode = e.shiftKey
		this.shouldPaint = true
		this.isPainting = true
		this.parametricBrushShader.use ()
		this.parametricBrushShader.uniforms.hue.set1f (Math.random ())
		$(window).mousemove ($.proxy (function (e) {
			this.paintTo = this.eventPoint (e)
			this.eraseMode = e.shiftKey
			this.shouldPaint = true
		}, this))
		$(window).mouseup ($.proxy (function () {
			this.updateImageBufferWithRandomImageFromInternet (_.noop)
			this.isPainting = false
			$(window).unbind ('mouseup')
			$(window).unbind ('mousemove')
		}, this))
	},

	updateImageBufferWithRandomImageFromInternet: function (done) {

		Image.fetch ('http://lorempixel.com/' + this.cellBuffer.width + '/' + this.cellBuffer.height + '/' + '?' + Math.random ())
			 .done (this.$ (function (img) {

				var canvas = document.createElement('canvas')
			    var ctx = canvas.getContext('2d')

			    canvas.width  = this.cellBuffer1.width
			    canvas.height = this.cellBuffer1.height

			    ctx.drawImage (img, 0, 0, canvas.width, canvas.height)

			    var image = new Image()
					image.src = canvas.toDataURL()

				this.imageBuffer.updateFromImage (image)

				done () })) },

	fillWithImage: function () { this.updateImageBufferWithRandomImageFromInternet (this.$ (this.resetCellBuffer)) },

	resetCellBuffer: function () {

		this.cellBuffer = this.cellBuffer2
		this.cellBuffer.draw (function () {
			this.convertColorsShader.use ()
			this.convertColorsShader.attributes.position.bindBuffer (this.square)
			this.convertColorsShader.uniforms.transform.setMatrix (this.screenTransform)
			this.convertColorsShader.uniforms.cells.bindTexture (this.imageBuffer, 0)

			this.square.draw () }, this)

				this.firstFrame = true
	},
	fillWithRandomNoise: function () {
		this.cellBuffer.draw (function () {
			this.randomNoiseShader.use ()
			this.randomNoiseShader.attributes.position.bindBuffer (this.square)
			this.randomNoiseShader.uniforms.gridSize.set1f (this.gridSize)
			this.randomNoiseShader.uniforms.seed.set2f (Math.random (), Math.random ())
			this.randomNoiseShader.uniforms.seed2.set2f (Math.random (), Math.random ())
			this.randomNoiseShader.uniforms.seed3.set2f (Math.random (), Math.random ())
			this.randomNoiseShader.uniforms.screenSpace.set2f (1.0 / this.cellBuffer.width, 1.0 / this.cellBuffer.height)
			this.square.draw ()
		}, this)
		this.firstFrame = true
	},
	fillWithNothing: function () {
		this.cellBuffer.draw (function () {
			this.gl.clearColor (0.0, 0.0, 0.0, 1.0)
			this.gl.clear (this.gl.COLOR_BUFFER_BIT)
		}, this)
	},
	springDynamics: $raw (function () {
		var zoom = this.getZoom ()
		if (!this.isDragging) {
			if (zoom > 0.99) {
				var center = this.transform.apply ([0, 0, 0])
				var springForce = [
					(Math.max (0, Math.abs(center[0]) - (zoom - 1))) / zoom,
					(Math.max (0, Math.abs(center[1]) - (zoom - 1))) / zoom]
				this.updateTransform (this.transform.translate ([
					(Math.pow (1.2, springForce[0]) - 1.0) * (center[0] > 0 ? -1 : 1),
					(Math.pow (1.2, springForce[1]) - 1.0) * (center[1] > 0 ? -1 : 1), 0.0]))
			} else {
				this.updateTransform (this.transform.translate (this.transform.applyInverse ([0, 0, 0])))
			}
		}
		if (zoom < 1.0) {
			var springForce = Math.pow (1.2, 1.0 - zoom)
			this.updateTransform (this.transform.scale ([springForce, springForce, 1.0]))
		}
	}),
	updateTransform: $raw (function (newTransform) {
		var viewportTransform = new Transform3D ()
		var aspect = this.viewportWidth / this.viewportHeight
		var bufferAspect = this.cellBuffer.width / this.cellBuffer.height
		if (this.cellBuffer.width < this.viewportWidth && this.cellBuffer.height < this.viewportHeight) {
			viewportTransform = viewportTransform.scale ([
				this.cellBuffer.width / this.viewportWidth,
				this.cellBuffer.height / this.viewportHeight, 1.0])
		} else {
			viewportTransform = viewportTransform.scale (this.cellBuffer.width > this.cellBuffer.height
				? [1.0, aspect / bufferAspect, 1.0]
				: [bufferAspect / aspect, 1.0, 1.0])
		}
		this.transform = newTransform || this.transform
		this.screenTransform = this.transform.multiply (viewportTransform)
	}),
	beforeDraw: $raw (function () {
		if (!this.paused) {
			if (this.shouldPaint) {
				this.paint (true)
			} else {
				this.iterate ()
			}
		} else if (this.shouldPaint) {
			this.paint (false)
		}
		this.springDynamics ()
	}),
	renderCells: $raw (function (callback) {
		/* backbuffering */
		var targetBuffer = (this.cellBuffer == this.cellBuffer1 ? this.cellBuffer2 : this.cellBuffer1)
		targetBuffer.draw (callback, this)
		this.cellBuffer = targetBuffer
		this.firstFrame = false
	}),
	iterate: $raw (function () { var framesToSkip = 20

		for (var i = 0; i < framesToSkip; i++) {
			this.renderCells (function () {
				this.updateProgramShader.use ()
				this.updateProgramShader.attributes.position.bindBuffer (this.square)
				this.updateProgramShader.uniforms.previousStep.bindTexture (this.cellBuffer, 0)

				_.each (this.programs, function (program, i) {
					this.updateProgramShader.uniforms['program' + i].bindTexture (program.buffer, 1 + i) }, this)

				this.updateProgramShader.uniforms.seed.set2f (Math.random (), Math.random ())

				//this.updateProgramShader.uniforms.lifeDecrease.set1f (1.0 / 255.0)

				this.frameNumber++
				if (this.frameNumber > framesToSkip) {
					this.updateProgramShader.uniforms.lifeDecrease.set1f (1.0 / 255.0)
					this.frameNumber = 0
				} else {
					this.updateProgramShader.uniforms.lifeDecrease.set1f (0.0);
				}

				this.updateProgramShader.uniforms.screenSpace.set2f (1.0 / this.cellBuffer.width, 1.0 / this.cellBuffer.height)
				this.updateProgramShader.uniforms.pixelOffset.set2f (
					0.5 / this.cellBuffer.width,
					0.5 / this.cellBuffer.height)
			    this.square.draw ()
			})
		}
	}),
	paint: $raw (function (animate) {
		this.paintParametricBrush (animate)
		this.paintFrom = this.paintTo
		this.shouldPaint = false
	}),
	paintParametricBrush: $raw (function (animate) {
		this.renderCells (function () {
			var pixelSpace = new Transform3D ()
				.scale ([this.viewportWidth, this.viewportHeight, 1.0])
				.multiply (this.screenTransform)
			var texelSize =
				pixelSpace.apply ([0,0,0])[0] -
				pixelSpace.apply ([-1.0 / this.cellBuffer.width, 0, 0])[0]
			this.parametricBrushShader.use ()
			this.parametricBrushShader.attributes.position.bindBuffer (this.square)
			this.parametricBrushShader.uniforms.cells.bindTexture (this.cellBuffer, 0)
			this.parametricBrushShader.uniforms.image.bindTexture (this.imageBuffer, 1)
			this.parametricBrushShader.uniforms.brushPosition1.set2fv (this.screenTransform.applyInverse (this.paintFrom))
			this.parametricBrushShader.uniforms.brushPosition2.set2fv (this.screenTransform.applyInverse (this.paintTo))
			this.parametricBrushShader.uniforms.pixelSpace.setMatrix (pixelSpace)
			this.parametricBrushShader.uniforms.pixelOffset.set2f (0.0,
				animate ? (-(0.5 + this.scrollSpeed * !this.firstFrame) / this.cellBuffer.height) : 0.0)
			this.parametricBrushShader.uniforms.screenSpace.set2f (1.0 / this.cellBuffer.width, 1.0 / this.cellBuffer.height)
			this.parametricBrushShader.uniforms.brushSize.set1f (Math.max (this.brushSize, texelSize))
			this.parametricBrushShader.uniforms.seed.set2f (Math.random (), Math.random ())
			this.parametricBrushShader.uniforms.noise.set1i (this.brushType == 'noise')
			this.parametricBrushShader.uniforms.fill.set1f (this.eraseMode ? 0.0 : 1.0)
			this.parametricBrushShader.uniforms.animate.set1i (animate ? 1 : 0)
			if (this.brushColor > 0.01) {
				this.parametricBrushShader.uniforms.hue.set1f (this.brushColor)
			}
		    this.square.draw ()
		})
	}),
	draw: $raw (function () {
		this.gl.disable (this.gl.DEPTH_TEST)
		this.drawCellsShader.use ()
		this.drawCellsShader.attributes.position.bindBuffer (this.square)
		this.drawCellsShader.uniforms.transform.setMatrix (this.screenTransform)
		this.drawCellsShader.uniforms.cells.bindTexture (this.cellBuffer, 0)
		this.square.draw ()
	}),
	noGL: function () {
		$('.no-webgl').modal ('show')
	}
})

$(document).ready (function () {
	life = new Life ({
		canvas: $('.viewport').get (0)
	})
})
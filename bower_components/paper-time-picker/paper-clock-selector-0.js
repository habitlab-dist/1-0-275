
    (function(){
      var SVG_NS = 'http://www.w3.org/2000/svg';

      var RADIANS_PER_DEGREE = Math.PI / 180;

      var ANIMATION_DURATION = 150; // in milliseconds

      // radius values as a percentage of the clock-face radius
      var MAX_VISIBLE = 12;

      var instanceCount = 0;
      
      var normalizeAngle = function(a) {
        // convert angle to a positive value between 0 and 360
        a = a ? a % 360 : 0;
        return a < 0 ? a + 360 : a;
      };
      
      function getShortestAngle(from, to) {
        var angle, offset = 0;
        from = from || 0;
        angle = normalizeAngle(from);
        if ( angle < 180 && (to > (angle + 180)) ) {
          offset = -360; 
        }
        if ( angle >= 180 && (to <= (angle - 180)) ) {
          offset = 360; 
        }
        return from + offset + (to - angle);
      }

      Polymer({
        is: 'paper-clock-selector',
        properties: {
          selected: {
            type: Number,
            notify: true,
            value: 0,
            observer: '_selectedChanged'
          },
          count: {
            type: Number,
            value: 0
          },
          step: {
            type: Number,
            value: 1,
            observer: '_stepChanged'
          },
          useZero: {
            type: Boolean,
            value: false
          },
          zeroPad: {
            type: Boolean,
            value: false
          },
          animated: {
            type: Boolean,
            value: false
          }
        },
        listeners: {
          'iron-resize': '_updateSize'
        },
        observers: [
          '_populate(count, step, useZero, _instanceId)',
          '_zeroPadChanged(zeroPad, _numbers)'
        ],
        behaviors: [
          Polymer.IronResizableBehavior
        ],
        ready: function() {
          this._currentAngle = 0;
          this._populate();
          this._selectedChanged(this.selected);
          this._instanceId = instanceCount++;
        },
        setClockHand: function(deg, animate, callback) {
          deg = normalizeAngle(deg);

          animate = typeof(animate) === 'undefined' ? this.animated : animate;
          animate = this._radius ? animate : false;

          var current = this._currentAngle;
          var rotate = getShortestAngle(current, deg);
          if (normalizeAngle(rotate) === current) {
            return this._setHandRotation(current, animate);
          }

          if (animate) {
            this._once('paper-clock-transition-end', function() {
              if (callback) {
                callback();
              }
            }.bind(this));
          }

          this.async(function() {
            this._setHandRotation(rotate, animate);
          });
        },
        _performRotation : function(angle, animate) {
          // If the angle is in transition from a previous animation, cancel it
          if (this._animationFrame) {
            window.cancelAnimationFrame(this._animationFrame);
          }

          // If the transition is animated, create an animation loop that will 
          // gradually increment towards the new angle while refreshing the hand positions
          if (animate) {
            var previousAngle = this._currentAngle;
            var angleDifference = angle - previousAngle;
          
            var animationStart = null;
            var incrementAngle = function(timestamp) {
              if (!animationStart) {
                animationStart = timestamp;
              }

              // Calculate the angle of rotation for this frame and apply it to the element
              var elapsedTime = timestamp - animationStart;
              var animationProgress = Math.min(elapsedTime / ANIMATION_DURATION, 1);
              this._currentAngle = previousAngle + (this._applyAnimationEasing(animationProgress) * angleDifference);
              this._updateHandPositions();

              // If the animation hasn't completed, request animation of the next frame
              if (animationProgress === 1) {
                this._animationFrame = null;
                this.fire('paper-clock-transition-end');
              } else {
                  this._animationFrame = window.requestAnimationFrame(incrementAngle);
              }
            }.bind(this);

            // Begin the animation loop by requesting the first frame
            this._animationFrame = window.requestAnimationFrame(incrementAngle);
          } else {
            // If the transition is not animated, set the end angle immediately
            this._currentAngle = angle;
            this._updateHandPositions();
          }
        },
        _applyAnimationEasing : function(progress) {
          return Math.pow(progress, 2);
        },
        _setHandRotation: function(deg, animate) {
          var hasLabel = ((deg / 360) * this.count) % this.step === 0 ;
          this.$.clockHand.classList[['remove', 'add'][+hasLabel]]('no-dot');
          this._performRotation(deg, animate);
        },
        _selectedChanged: function(selected) {
          if (!this.count || isNaN(selected)) {
            return;
          }
          var value = selected % this.count;
          var idx = value;

          if (idx === 0 && !this.useZero) {
            value = this.count;
          }
          if (value !== this.selected) {
            this.selected = value;
            return;
          }
          this._vibrate();
          this.setClockHand((360 / this.count) * this.selected);
        },
        _stepChanged: function(value, oldValue) {
          this._step = oldValue;
          if (!this.count || isNaN(value)) {
            return;
          }
          var minStep = Math.ceil(this.count / MAX_VISIBLE);
          if (value < minStep) {
            value = minStep;
          }
          this._step = value;
        },
        _populate: function() {
          delete this._resizedCache;
          var display, value, number;
          var $numbers = this.$.numbers;

          this.set('_numbers', []);
          this._stepChanged(this.step);

          // remove dom nodes since they'll be re-created
          while($numbers.firstChild) {
            $numbers.removeChild($numbers.firstChild);
          }

          var numbers = [];

          for (var i=0; i<this.count; i++) {
            value = i;
            display = null;
            if (i === 0 && !this.useZero) {
              value = this.count;
            }

            number = {
              index: i,
              value: value,
              display: value % this._step === 0,
              x: 0,
              y: 0,
              label: this._formatNumber(value)
            };

            number.dom = this._createNumberElement(number);
            numbers.push(number);
            $numbers.appendChild(number.dom.g);
          }
          this.set('_numbers', numbers);
          this._positionClockPoints();
          this._updateHandPositions();
        },
        _updateNumber: function(number) {
          var dom = number.dom;
          if (!dom) {
            return;
          }
          if (number.x && number.y && dom.text) {
            dom.text.setAttributeNS(null, 'x', number.x);
            dom.text.setAttributeNS(null, 'y', number.y);
            dom.text.textContent  = this._formatNumber(number.value);
            dom.textClipped.setAttributeNS(null, 'x', number.x);
            dom.textClipped.setAttributeNS(null, 'y', number.y);
            dom.textClipped.textContent = this._formatNumber(number.value);
          }
        },
        _createNumberElement: function(number) {
          // We can't use templates inside SVG elements, so we have to create
          // the numbers in dom and set up attribute bindings manually
          function create(type, classList) {
            var el = document.createElementNS(SVG_NS, type);
            if (classList) {
              classList.forEach(function(c) {
                el.classList.add(c);
              });
            }
            if (!Polymer.Settings.useNativeShadow) {
              el.classList.add('style-scope');
              el.classList.add('paper-clock-selector');
            }
            return el;
          }

          var g = create('g', ['number']);
          var text = null;
          var textClipped = null;
          if (number.display) {
            text = create('text');
            text.textContent = number.label;
            g.appendChild(text);
            textClipped = create('text', ['clipped']);
            textClipped.textContent = number.label;
            textClipped.setAttribute("clip-path", "url(#handClip" + this._instanceId + ")");
            g.appendChild(textClipped);
          }

          return {g: g, text: text, textClipped: textClipped};
        },
        _updateSize: function() {
          var radius = Math.min(this.offsetWidth, this.offsetHeight) / 2;

          this._radius = radius;
          this._selectorSize = 20;
          this._selectorDotSize = 3;
          this._padding = 2;
          this._positionClockPoints();

          this._resizedCache = this._radius;
          this.$.clock.style.width = (radius * 2) + 'px';
          this.$.clock.style.height = (radius * 2) + 'px';
          this._updateHandPositions();

          this.async(function() {
            // FIXME: this is hacky, but for some reason we need to wait a bit
            // to get an accurate measurement
            this._bounds = this.$.face.getBoundingClientRect();

            // account for page scrolling
            this._bounds = {
                top: this._bounds.top + window.pageYOffset,
                right: this._bounds.right + window.pageXOffset,
                bottom: this._bounds.bottom + window.pageYOffset,
                left: this._bounds.left + window.pageXOffset,
                width: this._bounds.width
            }
          }.bind(this), 150);
        },
        _positionClockPoints: function() {
          if (!this._radius) {
            return;
          }

          this._selectorOuter = this._radius - this._padding * 2;
          this._selectorInner = this._selectorOuter - this._selectorSize * 2;
          this._selectorCenter = this._selectorOuter - this._selectorSize;

          var numbers = this._numbers;
          var angle = (360 / this.count) * RADIANS_PER_DEGREE;

          var a, number;
          for (var i=0; i<this.count; i++) {
            a = angle * i;
            number = numbers[i];
            number.x = this._radius + (Math.sin(a) * this._selectorCenter);
            number.y = this._radius - (Math.cos(a) * this._selectorCenter);
            this._updateNumber(number);
          }
        },
        _notifyNumberChanged: function(path) {
          var propPath, props = ['x', 'y'];
          for (var i=0; i<props.length; i++) {
            propPath = path + '.' + props[i];
            if (this.get(propPath)) {
              this.notifyPath(propPath, this.get(propPath));
            }
          }
        },
        _getSelectArea: function(radius, outer, inner) {
          return '\n' +
            'M ' + (radius - outer) + ' ' + radius + '\n' + 
            'A ' + outer + ' ' + outer + ' 0 0 0 ' + (radius + outer) + ' ' + radius + '\n' + 
            'A ' + outer + ' ' + outer + ' 0 0 0 ' + (radius - outer) + ' ' + radius + '\n' + 
            'M ' + (radius - inner) + ' ' + radius + '\n' + 
            'A ' + inner + ' ' + inner + ' 0 0 1 ' + (radius + inner) + ' ' + radius + '\n'+ 
            'A ' + inner + ' ' + inner + ' 0 0 1 ' + (radius - inner) + ' ' + radius;
        },
        _onTouch: function(event) {
          var x = event.detail.x + window.pageXOffset - this._bounds.left - this._radius;
          var y = event.detail.y + window.pageYOffset - this._bounds.top - this._radius;

          /* only rotate while in the touch area */
          var distance = Math.abs(Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)));
          if (distance < this._selectorInner || distance > this._selectorOuter) {
            return;
          }

          /* don't animate while tracking */
          this.animated = event.type !== 'track';

          // use coords to find angle from 12 o'clock position
          var theta = Math.atan(y / x);
          theta = (Math.PI / 2) + (x < 0 ? theta + Math.PI : theta);
          var intervalRad = (360 / this.count) * RADIANS_PER_DEGREE;


          // determine the selected number
          this.selected = Math.round(theta / intervalRad);

          /* only fire selected when we've tapped or stopped tracking */
          if (event.type === 'tap' || event.detail.state === 'end') {
            this.fire('paper-clock-selected', {value: this.selected, animated: this.animated});
          }
        },
        _formatNumber: function(value) {
          if (this.zeroPad) {
            return ('0' + value).substr(-2);
          }
          return value.toString();
        },
        _getNumberClass: function(pfx, n, selected) {
          var cssClass = pfx;
          if (selected.value === n.value) {
            cssClass += ' selected';
          }
          return cssClass;
        },
        _vibrate: function() {
          this.debounce('vibrate', function() {
            if (navigator.vibrate) {
              navigator.vibrate(10);
            }
          });
        },
        _zeroPadChanged: function() {
          this._numbers.forEach(function(number) {
            this._updateNumber(number);
          }.bind(this));
        },
        _once: function(eventName, callback, node) {
          node = node || this;
          function onceCallback() {
            node.removeEventListener(eventName, onceCallback);
            callback.apply(null, arguments);
          }
          node.addEventListener(eventName, onceCallback);
        },

        _updateHandPositions : function() {
          if (!this._radius) {
            return;
          }

          var radians = this._currentAngle * RADIANS_PER_DEGREE;
          this._handX = this._radius + (Math.sin(radians) * this._selectorCenter);
          this._handY = this._radius - (Math.cos(radians) * this._selectorCenter);
        },

      });
    })();
  
/*  How-to / spec / test
    ============================================================================ */

_.tests['DOMReference + DOMEvents'] = {

    'DOMReference + DOMEvents basics': function () {

        $assertEveryCalled (function (changeCalled, reactToFocusEventsCalled, domReadyCalled) {

            /*  Example component that owns a DOM reference and listens to events
                ---------------------------------------------------------------- */

            var textarea = new ($component ({

                $traits: [DOMReference,
                          DOMEvents],

            /*  That's how you initialize DOMReference using $barrier (see the big
                comment below for the example on how to access the stored reference,
                and why/when you will need that domReady thing).
                ---------------------------------------------------------------- */

                init: function () { this.domReady (
                                            Node.make ('textarea')
                                                .insertMeAfter (document.body.lastChild)) },

            /*  That's how you bind to events (simplest way)
                ---------------------------------------------------------------- */

                change: $on (function (e) { changeCalled () }),

            /*  Binding with custom method name
                ---------------------------------------------------------------- */

                shouldNotCall: $on ('input', function () { $fail }),

            /*  Multiple events
                ---------------------------------------------------------------- */

                reactToFocusEvents: $on ('focus blur', function (e) { reactToFocusEventsCalled () }) })) ()


        /*  That's how you access DOM if you're 100% sure it's initialized
            -------------------------------------------------------------------- */

            var dom    = textarea.dom
                $assert (textarea.dom instanceof Node)


        /*  Often you stumble upon a situation when your code tries to access
            something that is not initialized yet (e.g. a DOM tree).

            Even if you 'fix' that by rearranging the call order, you cannot
            always rely on predictable outcome of that method: as components get
            more complex, you need to look forward for more reliable control
            mechanisms... at least, more reliable than shuffling init calls
            randomly to see if it 'solves' the problem.

            Normally, it solved by introducing some well-known concurrent
            programming techniques - like a barrier, in this case. By simply
            encapsulating all unsafe DOM accesses to the barrier context,
            you enforce the expected call order automagically™, paying a
            minuscule runtime overhead for that.
            -------------------------------------------------------------------- */

            textarea.domReady (function (dom) {
                                    $assert (_.isTypeOf (Node, dom))
                                        domReadyCalled () })


        /*  That's how you dispatch events programmatically
            TODO: configuration
            -------------------------------------------------------------------- */

            textarea.dispatchEvent ('change')
            textarea.dispatchEvent ('blur')


        /*  That's how you enumerate listeners bound with $on  
            -------------------------------------------------------------------- */

            /*  To get actual methods [via instance method]
             */
            $assertCalledWithArguments ([['change', textarea.change],
                                         ['input',  textarea.shouldNotCall],
                                         ['focus',  textarea.reactToFocusEvents],
                                         ['blur',   textarea.reactToFocusEvents]], textarea.forEachDOMEventListener)

            /*  To get schema [via static member]
             */
            $assert ([['change', 'change'],
                      ['input',  'shouldNotCall'],
                      ['focus',  'reactToFocusEvents'],
                      ['blur',   'reactToFocusEvents']], textarea.constructor.DOMEventListeners)


        /*  Deinitialization semantics
            -------------------------------------------------------------------- */
        
            textarea.destroy ()

            textarea.dispatchEvent ('input')    /*  removes event listeners, so our .shouldNotCall listener shouldn't get called */
            $assert (dom.isRemovedFromDocument) /*  removes node from document */
            $assert (textarea.dom, undefined)   /*  sets .dom to undefined     */ }) },


/*  Listeners defined in traits are bound in order of appearance, so you can
    utilize built-in e.stopImmediatePropagation () semantics for the flow control.
    -------------------------------------------------------------------- */

    'Blocking event propagation in $traits with e.stopImmediatePropagation': function () {

        $assertEveryCalled (function (blockChangeEventCalled) {

            var textarea = new ($component ({

                    $traits: [DOMReference,
                              DOMEvents,
                              $trait ({ blockChangeEvent: $on ('change', function (e) { blockChangeEventCalled (); e.stopImmediatePropagation () }) }),
                              $trait ({ shouldNotCall:    $on ('change', function (e) { $fail }) }) ],

                    init: function () { this.domReady (
                                            Node.make ('textarea')
                                                .insertMeAfter (document.body.lastChild)) } })) ()

                textarea.dispatchEvent ('change')
                textarea.destroy () }) } }


/*  Impl.
    ======================================================================== */

DOMReference = $trait ({

        domReady: $barrier (function (dom) {
                                 this.dom = dom
                                 this.el  = this.el || jQuery (dom) }),

    afterDestroy: function () {  this.dom.removeFromParent ()
                                 this.dom = undefined
                                 this.el  = undefined } })

/*  ======================================================================== */

DOMReferenceWeak = $trait ({
    
    domReady: $barrier (function (dom) { this.dom = dom }),
    afterDestroy:       function ()    { this.dom = undefined } })


/*  ======================================================================== */

DOMEvents = $trait ({

    /*  $on syntax
     */
    $macroTags: {

        on: function (def, method, methodName) { var DOMEventListeners = (def.constructor.DOMEventListeners ||
                                                                         (def.constructor.DOMEventListeners = []))
                _.each ((_.isString (method.$on) ? method.$on 
                                                 : methodName).split (' '), function (eventName) {
                                                                                DOMEventListeners.push ([eventName, methodName]) }) } },
    forEachDOMEventListener: function (accept) {
                                _.each (this.constructor.DOMEventListeners, function (names) {
                                                                                accept.call (this, names[0], this[names[1]]) }, this) },

    dispatchEvent: function (type) {
                        this.domReady (function (dom) { var e = document.createEvent ('Event')
                                                            e.initEvent (type)
                                         dom.dispatchEvent (e) }) },

    /*  Bindings
     */
    domReady: function (dom) {
                this.forEachDOMEventListener (dom.$ (dom.addEventListener)) },

    beforeDestroy: function () {
                        this.domReady (function (dom) {
                            this.forEachDOMEventListener (dom.$ (dom.removeEventListener)) }) } })


/*  ======================================================================== */




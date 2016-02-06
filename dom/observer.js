/*  Filters jQuery-generated random elements. Google for 'expando' and 'sizzle'
    for the details on subject.
    ======================================================================== */

$mixin (Node, { isJQuerySizzleGarbage: $property (function () {
                    return this.id && (this.id.indexOf ('sizzle') === 0) }) })

/*  ======================================================================== */

DOMObserver = $component ({

    $traits: [//Testosterone.ValidatesRecursion,
              //Testosterone.LogsMethodCalls,
              DOMReferenceWeak,
              DOMEvents],

/*  Test (TODO: make it more explicit/readable)
    ======================================================================== */

    $test: function () {

            var h = []

            var div = Node.div.insertMeAfter (document.body.lastChild)
                div.toggleAttribute ('contenteditable', true)

            var obs = new DOMObserver ({
                                target: div,
                                changed: function (node, change) { h.push ([node, change.what]) }})

                div.innerHTML = '<p>1234</p><p>56789</p>'
                var p1 = div.firstChild,
                    p2 = div.lastChild

                Range.current = Range.make ({ startContainer: p1.firstChild, startOffset: 2,
                                                endContainer: p2.firstChild,   endOffset: 3 })

                document.execCommand ('delete', false, null)

                $assert (_.filter (h, function (e) { return (e[0] === p1) || (e[0] === p2) }),
                    [[p1, 'insert'],
                     [p2, 'insert'],
                     [p2, 'remove']])

                div.innerHTML = '<p>123</p>'
                               var _123 = div.firstChild.firstChild

                var textChanged = [] 
                obs.textChanged (function (n, was) { textChanged.push ([was, n.nodeValue]) })

                    _123.nodeValue = 'foo'
                    _123.nodeValue = 'bar'
                    _123.nodeValue = 'baz'

                    $assert (textChanged, [['123',  'foo'],
                                                   ['foo',  'bar'],
                                                           ['bar', 'baz']])
            obs.destroy ()
            div.removeFromParent () },

/*  Public API
    ======================================================================== */

    $defaults: {
        target:   undefined,
        filter: _.constant (true) },

    changed:        $trigger (),
    inserted:       $trigger (),
    removed:        $trigger (),
    attrChanged:    $trigger (),
    textChanged:    $trigger (),

    doWith: $static (function (cfg, actions) { var obs = new DOMObserver (cfg)
                                    actions ();    obs.destroy () }),

/*  Links observed Node instances with DOMObserver context
    ======================================================================== */

    allocId: $static (function () {
        return arguments.callee.counterValue =
              (arguments.callee.counterValue || 0) + 1 }),

    nodeContext: function (n) {      var prop = 'DOMObserverContext_' + this.id
                                return n[prop] || (n[prop] = {}) },

/*  ======================================================================== */

    init: function () { var self = this

        this.id = DOMObserver.allocId ()

        /*  Add garbage filtering to event listeners
         */
        _.each (this.constructor.DOMEventListeners, function (eventNames, methodName) {
            var fn = self[methodName]
                     self[methodName] = function (e) { if (self.shouldObserve (e.target)) { fn.call (self, e) } } })

        this.domReady (this.target || document) },

    shouldObserve: function (n) { return !n.isJQuerySizzleGarbage && this.filter (n) },

/*  DOMNodeInserted workaround. The bug (WebKit):
        
        1. When inserting <p><a>123</a></p>, it reports only <p>
        2. When removing <p>, it removes its children too (<a> from <p>, and 123 from <a>)
        3. It results to unability to restore previous state when un-doing #2

    Fix: manually call DOMNodeInserted on sub nodes
    ======================================================================== */

    DOMNodeInserted: $log ($green ($on (function (e) { this.insertedWithSubtree (e.target) }))),

    insertedWithSubtree: $allowsRecursion (function (n) { if (this.shouldObserve (n)) {

         var nodeContext = this.nodeContext (n)
        if (!nodeContext.prevLocation ||
            (nodeContext.prevLocation.parent !== n.parentNode) ||
            (nodeContext.prevLocation.next   !== n.nextSibling)) {

                    if (nodeContext.prevLocation) {
                        this.DOMNodeRemoved ({  emulated: true,
                                                target: n,
                                                prevValue: nodeContext.prevLocation }) }

                    this.changed   (n, { what: 'insert' })
                    this.inserted  (n)

                    nodeContext.prevLocation = n.treeLocation
                    nodeContext.prevCharData = n.nodeValue
            _.each (nodeContext.prevChildren = n.childNodesArray, this.insertedWithSubtree) }

        else { log.d (n, '- already inserted') } } }),

/*  DOMNodeRemoved emulation. The bug (WebKit):

        1.  It does not always report with DOMNodeRemoved when it removes
            nodes from parent. It occurs not only when removing subtrees,
            so cannot fix it like DOMNodeInserted was fixed.

        2.  Upon node removal, it deletes even the character data (but
            fails to report on that).

    Fix: It seems like at least DOMSubtreeModified is called properly.
         So manually detect removal with the help of it. Detect character
         data change on removal.
    ======================================================================== */

    DOMSubtreeModified: $on (function (e) { this.checkIfChildrenRemoved (e.target) }),

    checkIfChildrenRemoved: $allowsRecursion (function (parent) { if (this.shouldObserve (parent)) {

                        var parentContext = this.nodeContext (parent)
        for (var children = parentContext.prevChildren || [],   i = 0;
                                                                i < children.length;
                                                                i++) {
            var child        = children[i]
            var childContext = this.nodeContext (child)
            
            if (this.shouldObserve (child) &&
                                    child.parentNode !== parent) {
                
                if ((childContext.prevCharData !== undefined) &&
                    (childContext.prevCharData !== child.nodeValue)) {
                    this.DOMCharacterDataModified ({
                        emulated:   true,
                        target:     child,
                        prevValue:  childContext.prevCharData }) }

                this.checkIfChildrenRemoved (child)

                this.DOMNodeRemoved ({
                        emulated:   true,
                        target:     child,
                        prevValue:  { parent: parent, next: children[i + 1] || null } }) } }

        parentContext.prevChildren = parent.childNodesArray
        parentContext.inserted     = false } }),

    DOMNodeRemoved: $log ($red (function (e) { // emulated (hence not bound with $on)

        e.prevLocation = e.prevValue

        this.changed (e.target, { what: 'remove', was: e.prevValue })
        this.removed (e.target,                        e.prevValue  ) })),
    
/*  ======================================================================== */

    DOMCharacterDataModified: $log ($orange ($on (function (e) {

        var n = e.target, was = (e.prevValue === 'null' ? null : e.prevValue)

        this.nodeContext (n).prevCharData = n.nodeValue
        this.changed     (n, { what: 'text', was:   was })
        this.textChanged (n,                        was) })))

/*  ======================================================================== */

})






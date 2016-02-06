              /*   local macros, to help define stuff
               */
(function () { var is   = function (tag) { return function () { return this.tagName === tag } }
               var make = function (tag) { return function () { return document.createElement (tag.uppercase) } }


/*  $mixin is like 'take $prototype-like definition and unroll it onto
     some existing stuff': not for creating new types, but for patching
     existing ones.

     P.S.   Not every feature of $prototype is applicable here (check
            implementation at useless/base/OOP.js for details)
            
    ======================================================================== */

    $mixin (Node, {

        $: $prototype.impl.$,    // brings this.$ semantics from $prototype


    /*  Constructors
        ======================================================================== */

        $static: {

            make: make.then (_.call),
            text: function (text) { return document.createTextNode (text) },

            $property: {    linebreak: make ('BR'),
                            paragraph: make ('P'),
                            div:       make ('DIV') } },
        
    /*  Various predicates
        ------------------

        New $callableAsFreeFunction tag means that its subject will be available
        as context-free (static) version along with instance method. For example,
        following two calls are equivalent:

            console.log (document.body.isLinebreak)
            console.log (Node.isLinebreak (document.body))

        Having dual calling convention for common predicates is super useful, as
        you can use them in functional data-crunching expressions, where free
        functions are far more suitable than instance methods.

        It was inspired by $extensionMethods from Useless, where it carries the
        exact same semantics for member definitions. Those definitions served
        a very limited purpose of merging Underscore functions to built-in types,
        so a more generic tool needed.
        
        ======================================================================== */

        $callableAsFreeFunction: {

            $property: {

                isElement: function () { return (this.nodeType === Node.ELEMENT_NODE) },
                isText:    function () { return (this.nodeType === Node.TEXT_NODE) },

                isLinebreak: is ('BR'),
                isDiv:       is ('DIV'),
                isParagraph: is ('P'),
                isHyperlink: is ('A'),

                isEmptyParagraph: function () {
                    return this.noChildren ||
                         ((this.childNodes.length === 1) && this.firstChild.isLinebreak) },

                isRemovedFromDocument: function () {
                    return this.matchUpwards (_.equals (document.body)) ? false : true },

                forbidsEditing: function () {
                    return (this.nodeType === Node.ELEMENT_NODE) &&
                           (this.getAttribute ('contenteditable') === 'false') } } },

    /*  Up/outside means
        ======================================================================== */

        grandParentNode: $property (function () { return this.parentNode && this.parentNode.parentNode }),

        isFirstInParent: $property (function () { return this.parentNode && (this.parentNode.firstChild === this) }),
        isLastInParent:  $property (function () { return this.parentNode && (this.parentNode.lastChild  === this) }),

        removeFromParent: function () { this.parentNode.removeChild (this); return this },

        outerLeftBoundaryIn: function (container) { var n = this
            while (n.grandParentNode && (n.parentNode !== container) && n.isFirstInParent) { n = n.parentNode }
            return n },

        outerRightBoundaryIn: function (container) { var n = this
            while (n.grandParentNode && (n.parentNode !== container) && n.isLastInParent) { n = n.parentNode }
            return n },

        matchUpwards: function (pred) { var n = this
                   while (n && !pred (n)) { n = n.parentNode }
                                     return n },

        isLeftmostNodeIn: function (parent) {
                             return parent && ((this.matchUpwards (function (n) {
                                                                     return (n === parent) ||
                                                                            !n.isFirstInParent })) === parent) },

    /*  Down/inside means
        ======================================================================== */

        hasChildren: $property (function () { return   this.hasChildNodes () }),
        noChildren:  $property (function () { return !(this.hasChildNodes ()) }),
        numChildren: $property (function () { return   this.childNodes.length }),

        length: $property (function () { return (this.childNodes ? this.childNodes.length :
                                                 (this.nodeValue ? this.nodeValue.length  : 0)) }),

        /*  If you modify childNodes while iterating it, you'll get into problem.
            Use following method to safely do so.
         */
        safeEnumChildren: function (fn, context) { _.each (
              this.childNodesArray, fn, context || this); return this },

        /*  childNodes is not really an array, so to get Array instance, use this helper
         */
        childNodesArray: $property (function () { return _.asArray (this.childNodes) }),

        appendChildren: function (nodes) { _.each (nodes, function (n) { this.appendChild (n) }, this); return this },
        removeChildren: function (nodes) { _.each (nodes, function (n) { this.removeChild (n) }, this); return this },

        walkTree: function (cfg, accept) {

                    var walker = document.createTreeWalker (this,   cfg.what,
                                                                    cfg.filter || null,
                                                                    cfg.entityReferenceExpansion || null)

                    while ((node = walker.nextNode ())) { accept (node) } },

    /*  Sideways means
        ======================================================================== */

        nextSiblings: $property (function ()  { var r = [],     n = this
                                    while (n) {     r.push (n); n = n.nextSibling } return r }),

        nextInnermostSibling: $property (function () {                var n = this
                                            while (n && !n.nextSibling) { n = n.parentNode  } // walk upwards until has next sibling
                                               if (n)                   { n = n.nextSibling } // take next sibling
                                            while (n && n.firstChild)   { n = n.firstChild  } // walk downwards until end
                                                                   return n }),

        nextNextSibling: $property (function () {
            return (this.nextSibling && this.nextSibling.nextSibling) }),

        insertMeBefore: function (ref) {
            ref.parentNode.insertBefore (this, ref); return this },

        insertMeAfter: function (ref) {
            ref.parentNode.insertBefore (this, ref.nextSibling); return this },

        insertBeforeMe: function (nodes) { var parent = this.parentNode
                                           var me     = this

            _.each (_.coerceToArray (nodes).reversed, function (n) { parent.insertBefore (n, me) }); return this },

        insertAfterMe: function (nodes) { var parent = this.parentNode
                                          var next   = this.nextSibling

            _.each (_.coerceToArray (nodes).reversed, function (n) { parent.insertBefore (n, next) }); return this },


    /*  Other stuff
        ======================================================================== */

        toggleAttribute: function (name, value) {
                                     if (value) { this.setAttribute    (name, true) }
                                           else { this.removeAttribute (name) }
                                    return this },

        intAttribute: function (name) { return (this.getAttribute (name) || '').parsedInt },

        moveCaret: function (offset) { NormalizedCaretPosition.move (this, offset); return this },

        splitSubtreeBefore: function (node) { // returns right (newly created) subtree
            if (!node || (node.parentNode === this)) {
                return node }
            else {
                return this.splitSubtreeBefore (
                                    !node.previousSibling // if first node in parent, nothing to split – simply proceed to parent
                                        ? node.parentNode
                                        : document.createElement (node.parentNode.tagName)
                                                  .insertMeAfter (node.parentNode)
                                                  .appendChildren (node.nextSiblings)) } },

        splitSubtreeAt: function (location) { var n = location.node, i = location.offset
            return (i > 0) ? (location.node.isText ?
                                this.splitSubtreeBefore (Node.text (n.nodeValue.substr (i)).insertMeAfter (_.extend (n, { nodeValue: n.nodeValue.substr (0, i) }))) :
                                this.splitSubtreeBefore (n.childNodes[i])) :
                                this.splitSubtreeBefore (n) } })


/*  ========================================================================= */

    $mixin (CanvasRenderingContext2D, {

        bytes: $property (function () {

            var mime        = 'image/' + (type || 'jpeg')
            var dataURI     = this.toDataURL (mime, compression || 0.9)
            var byteString  = atob (dataURI.split(',')[1])
            var ab          = new ArrayBuffer (byteString.length)
            var ia          = new Uint8Array (ab)

            for (var i = 0, n = byteString.length; i < n; i++) {
                ia[i] = byteString.charCodeAt (i) }

            return ia }) })


/*  Image extensions (again found myself writing the same repetitive
    Image-loading snippet, so decided to finally make a reusable abstraction,
    utilizing the recent Promise concept just for fun)
    ========================================================================= */

    $mixin (Image, {

        fetch: $static (function (url) {
            return new Promise (function (resolve, reject) {
                                _.extend (new Image (), {
                                        crossOrigin: 'anonymous',
                                                src:  url,
                                             onload:  function ()  { resolve (this) },
                                            onerror:  function (e) { reject (e) } }) }) }) })

/*  ======================================================================== */

}) ()







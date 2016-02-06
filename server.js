/*  Run this file with

    > node server.js
 */

require ('useless')

Turing2D = $singleton (Component, {

    devHint: _.noop,

    api: function () { return {
                            '/':                 this.file ('./index.html'),
                            ':file':             this.file ('./') } },

    $depends: [
        
    //    require ('useless/server/supervisor'),
    //    require ('useless/server/deploy'),
        require ('useless/server/http'),
        require ('useless/server/templating'),
        require ('useless/server/websocket'),
        require ('useless/server/devtools'),
        require ('useless/server/uptime') ],

    init: function (then) { log.i ($uselessPath); log.green ('Turing2D is running at http://localhost:1333'); then () } })

var httpServer = require('http').createServer(callback);

require('reliable-signaler')(httpServer || expressServer || portNumber, {
    // for custom socket handlers
    socketCallback: function(socket) {
        socket.on('custom-handler', function(message) {
            socket.broadcast.emit('custom-handler', message);
        });
    }
});

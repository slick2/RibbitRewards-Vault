/*
*
*Simple directory server on 3006 can be proxied through 80
*
*/
var express = require('express');
var quickconnect = require('rtc-quickconnect');
var mesh = require('rtc-mesh');
/*var bridge = require('./remoting/bridge.js')*/
// initialise the connection

/////
/*var qc = quickconnect('https://switchboard.rtc.io/', {
    room: 'ribbit.me',
    plugins: [require('rtc-plugin-node')]
});

// create the model
var model = mesh(qc);

// report data change events
model.on('change', function (key, value) {
    console.log('captured change key: "' + key + '" set to ', value);
});

model.on('add', function (row) {
    console.log('new row created: ', row);
});*/



var app = express();

app.use(express.static("./"));
//http://localhost:3006/join/{cmd:"join",foo:"bar"}

app.get('/bus/:command/:payload', function (req, res) {
    var command = req.params["command"]
    var payload
    try {
        payload = JSON.parse(req.params["payload"])
    } catch (e) {
        payload = req.params["payload"]
    }
    //model.set('msgbus-'+command, payload);
    res.json({cmd: command, payload: payload})
})

app.get('/retrieve/:key', function (req, res) {
    /*model.retrieve(req.params["key"], function(err, result) {
        res.json({ error: err, result: result })
    })*/
})

app.listen(process.env.PORT || 3006);

exports.exp = app
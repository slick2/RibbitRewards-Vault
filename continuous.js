var express = require('express')
var basicAuth = require('http-auth')

var app = express()

var basic = basicAuth.basic({
    realm: 'Admin Stuff'
}, function(username, password, callback) {
    callback(username == 'admin' && password == 'password');
})

var authMiddleware = basicAuth.connect(basic)

app.post('/deploy',authMiddleware,function(req,res){
    doExecGit(function(error, stdout, stderr){
        var retValue = {error: error || "", stdout: stdout || "" , stderr: stderr || ""  }
        console.log(retValue)
        res.json(retValue)
    })
})

app.listen(3009)

function doExecGit(cb){
    var exec = require('child_process').exec,
        child;
    
    child = exec('git pull',
      function (error, stdout, stderr) {
        cb(error,stdout,stderr)
    });
}
var express = require('express')
var basicAuth = require('http-auth')
var git    = require('gitty');
var vaultGit = git('/root/RibbitRewards-Vault');

var app = express()

var basic = basicAuth.basic({
    realm: 'Admin Stuff'
}, function(username, password, callback) {
    callback(username == 'admin' && password == 'password');
})

var authMiddleware = basicAuth.connect(basic)

app.get('/deploy',authMiddleware,function(req,res){
    vaultGit.pull(function(err, log){
        if (err) return console.log('Error:', err);
        else res.json({status:"deploying", gitlog: log})
    })
})

app.listen(3009)
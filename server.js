/*
*
*Simple directory server on 3006 proxied through 80
*
*/
var express = require('express');
var app = express();

app.use(express.static("/root/RibbitRewards-Vault/" ));

app.listen(process.env.PORT || 3006);
var chat = {}
var signChat = getsignMessage(newtables.privkey.table)

var Chat = function (obj) {
    chat.msg = obj.payload
    
    if (obj.address !== undefined) {
        chat.identity = obj.address
    }
    
    if (obj.signature !== undefined) {
        chat.signature = obj.signature
        return chat
    } else {
        chat.signMessage()
        return chat
    }
}

var Message = require('bitcore-message');

chat.signMessage = function() {
    signChat(chat.msg, function (address, signature) {
        chat.signature = signature
        chat.identity = address
    })
}

chat.broadcast = function () {
    chat.addToTip(function() {
        meshnet.broadcastChat(chat)
    })
}

chat.sigmatch = function () {
    var verified = new Message(chat.msg).verify(chat.identity, chat.signature)
    return verified
}

chat.addToTip = function (cb) {
    if (cb === undefined) {cb = function(out) {console.log(out)}}
    var newTip = new ChatTip()
    var currentTip = {}
    meshnet.retrieveData("chatTip", function (err, foundTip) {
        
        if (err === "record not found") {
            currentTip.height = 0
            currentTip.hash = 0
        } else { currentTip = foundTip }
        chat.height = currentTip.height + 1
        if (chat.previousHash === currentTip.hash) {return}
        chat.previousHash = currentTip.hash

        chat.hash(function(hash) {
            newTip.hash = hash
            newTip.height = currentTip.height + 1
            newTip.identityAddress = chat.identity
            newTip.previousHash = currentTip.hash
            meshnet.setValue("chatTip", newTip, function () {
                chat.store(function(out) {
                    return cb(out)
                })
            })
        })
    })
}

chat.store = function (cb) {
    chat.hash(function(hash) {
        meshnet.setValue(hash, chat, function () {
            return cb()
        })
    })
    
}

chat.hash = function(cb) {
    var hash = CryptoJS.SHA256(chat.identity+"|"+ chat.msg+"|"+chat.signature)
    return cb(hash.toString())
}

chat.prehash = function (cb) {
    var hash = chat.identity + "|" + chat.msg + "|" + chat.signature
    return cb(hash.toString())
}

chat.toObj = function() {
    var obj = {}
    obj.address = chat.identity
    obj.signature = chat.signature
    obj.msg = chat.msg
    return obj
}


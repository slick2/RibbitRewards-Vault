var Peer = function () {
    return peerObj
}

var PeerFromAddress = function (address) {
    meshnet.retrieveData(address, function (err, obj) {
        if (err) return;
        Peer(obj)
    })
    return peerObj
}

var Peer = function (obj) {
    if (typeof obj === 'object') {
        if (peerObj.address !== undefined) {
            peerObj.address = obj.address
        }
        if (peerObj.peerid !== undefined) {
            peerObj.peerid = obj.peerid
        }
        if (peerObj.online !== undefined) {
            peerObj.online = obj.online
        }
        if (peerObj.photo !== undefined) {
            peerObj.photo = obj.photo
        }
    } else {
        return PeerFromAddress(obj)
    }

    return peerObj
}

var peerObj = {
    address: "",
    peerid: "",
    online: false,
    photo: {
        data: "",
        id: "",
        location: "",
    }
}

peerObj.makeFriend = function(cb) {
    newtables.peers.tofriend(peerObj.address, cb)
}

peerObj.loseFriend = function (cb) {
    newtables.peers.unfriend(peerObj.address, cb)
}


var Identity = {}

Identity.generate = function(cb){
        var HDKey = new bitcore.HDPrivateKey()
        return cb(HDKey)
}

Identity.getIdentity = function(cb) {
    return cb(foundIdentity[0].address.addressData)
}

Identity.getIdentityPrivateKey = function(cb) {
        var privateKey
        Identity.getIdentity(function(record){
                privateKey = new bitcore.HDPrivateKey(record.key)
                return cb(privateKey)
        })
        
}

Identity.getIdentityPublicKey = function(cb) {
        Identity.getIdentityPrivateKey(function(record){
                return cb( bitcore.HDPublicKey(record).toString())
        })
}

Identity.getIdentityAddress = function(cb) {
        Identity.getIdentityPrivateKey(function(record){
                var newAddress = new bitcore.Address(record.publicKey, bitcore.Networks.livenet)
                return cb(newAddress.toString())
        })
}
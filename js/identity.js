var Identity = {}

Identity.generate = function(cb){
        var HDKey = new bitcore.HDPrivateKey()
        return cb(HDKey)
}

Identity.getIdentity = function(cb) {
    Vault.database.getRowByKey("privkey", "format", "Extended Identity", function(tx,error,row) {
        if (row != null) {
            if (verbose) console.log("found Identity: " + JSON.stringify(row))
            return cb(row)
        }
        else
            var identity = Vault.saveHDAddress(function(row, error) {
                if (verbose) console.log("generated identity: " + row)
                return cb(row)
            })
    })
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
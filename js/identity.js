var Identity = {}

Identity.generate = function(cb){
        var HDKey = new bitcore.HDPrivateKey()
        return cb(HDKey)
}
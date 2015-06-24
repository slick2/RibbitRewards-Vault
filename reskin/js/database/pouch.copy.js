var Vault = {}
var tables = {}

tables.address = new PouchDB('vault_address')
tables.address.createIndex({
  index: {
    fields: ['seedId', 'compressed', 'pubkeyId', 'privkeyId', 'addressData', 'type']
  }
})
tables.multisig = new PouchDB('vault_multisig')
tables.multisig.createIndex({
  index: {
    fields: ['redeemScript', 'pubkeyIds', 'addressIds']
  }
})
tables.pubkey = new PouchDB('vault_pubkey')
tables.pubkey.createIndex({
  index: {
    fields: ['foo', 'bar', 'baz']
  }
})
tables.privkey = new PouchDB('vault_privkey')
tables.privkey.createIndex({
  index: {
    fields: ['foo', 'bar', 'baz']
  }
})
tables.channel = new PouchDB('vault_channel')
tables.channel.createIndex({
  index: {
    fields: ['foo', 'bar', 'baz']
  }
})

Vault.tables = tables

var remoteCouch = false;
var verbose = false

/* View Records*/
Vault.getAllRecordsOfType = function(table, cb){
    table.allDocs({include_docs: true, descending: true}, function(err, doc) {
        cb(doc)
     });
}

Vault.getRecordOfType = function(table,id,cb) {
    table.get(id).then(function (doc) {
      return cb(doc)
    }).catch(function (err) {
      console.log(err);
    })
}

/* ADD Records */

Vault.saveHDAddress = function(isIdentity,cb) {
    var payload = {}
    var privateKey = new bitcore.HDPrivateKey()
    payload.address = new bitcore.Address(privateKey.publicKey, bitcore.Networks.livenet).toString();
    payload.pubkey = bitcore.HDPublicKey(privateKey.xprivkey)
    payload.encrypted = false
    payload.privkey = privateKey.xprivkey
    payload.compressed = false
    payload.identity = isIdentity

    Vault.insertAddress(payload, function(row) {
        return cb(row)
    })
}

Vault.insertAddress = function(payload, cb){
    
    /*Define my data to insert*/
    var addressInsertData = payload
    var pubkeyInsertData = {
        key: payload.pubkey,
        owner: "me" 
    }
    var privkeyInsertData = {
            format: "WIF",
            key: payload.privkey
        }
        //mod for extended keys
    if (payload.privkey.indexOf('xprv') > -1 && (payload.identity == false || payload.identity == null))
        privkeyInsertData.format = "Extended"
    else if (payload.identity == true) {
        delete addressInsertData.identity
        addressInsertData.type = "Identity"
        privkeyInsertData.format = "Extended Identity";
    }
    
    /* Define my next function */
    var handleKeyAndAddress = function() {
        Vault.addPublicKey(pubkeyInsertData.key,pubkeyInsertData.owner,function(row){
            addressInsertData.pubkeyId = row.id
            Vault.addPrivateKey(privkeyInsertData.format,privkeyInsertData.key,function(row){
                addressInsertData.privkeyId = row.id
                Vault.addAddress("",addressInsertData.compressed,addressInsertData.encrypted, addressInsertData.location,addressInsertData.pubkeyId, addressInsertData.privkeyId, addressInsertData.seedId, addressInsertData.address, "Identity", function(row){
                    return cb(row)
                })
            })
        })
    }
    
    /* Do Work */
    if (payload.seed != null) {
        Vault.addPrivateKey("brain",payload.seed,function(row){
            addressInsertData.seedId = row.id
            handleKeyAndAddress()
        })
    } else {
        handleKeyAndAddress()
    }
}

Vault.addAddress = function(label, compressed, encrypted, location, pubkeyId, privkeyId, seedId, addressData, type, cb) {
    var address = {
        _id: new Date().toISOString(),
        label: label,
        compressed: compressed,
        encrypted : encrypted,
        location : location,
        pubkeyId : pubkeyId,
        privkeyId : privkeyId,
        seedId : seedId,
        addressData : addressData,
        
    }
  tables.address.put(address, function callback(err, result) {
    if (!err) {
      console.log('Successfully added an address!');
      return cb(result)
    } else {return cb(err)}
  })
}

Vault.addPrivateKey = function(format, key, cb) {
    var privateKey = {
        _id: new Date().toISOString(),
        format: format,
        key, key
    }
  tables.privkey.put(privateKey, function callback(err, result) {
    if (!err) {
      console.log('Successfully added an privateKey!');
      return cb(result)
    } else {return cb(err)}
  });
}

Vault.addPublicKey = function(key, owner, cb) {
    var publicKey = {
        _id: new Date().toISOString(),
        key, key,
        owner, owner
    }
  tables.pubkey.put(publicKey, function callback(err, result) {
    if (!err) {
      console.log('Successfully added an publicKey!');
      cb(result)
    } else {return cb(err)}
  });
}

Vault.addMultisig = function(redeemScript, pubkeyIds, addressIds, cb) {
    var multisig = {
        _id: new Date().toISOString(),
        redeemScript: redeemScript,
        pubkeyIds: pubkeyIds,
        addressIds: addressIds
    }
  tables.multisig.put(multisig, function callback(err, result) {
    if (!err) {
      console.log('Successfully added an multisig!');
      cb(result)
    } else {cb(err)}
  });
}

Vault.addChannel = function(redeemScript, pubkeyIds, addressIds, key, cb) {
    var channel = {
        _id: new Date().toISOString(),
        pubkeyIds: pubkeyIds,
        name, name,
    }
  db.channel.put(channel, function callback(err, result) {
    if (!err) {
      console.log('Successfully added an channel!');
      return cb(result)
    } else {return cb(err)}
  });
}

/* Gets */

Vault.getRecordsFilteredOfType = function(table,filter,value,cb){
    var returnRecords = []
    Vault.getAllRecordsOfType(table,function(records){
        for (var i = 0; i < records.rows.length; i++) {
            if (records.rows[i].doc[filter] == value)
                returnRecords.push(records.rows[i].doc)
        }
        return cb(returnRecords)
    })
}

Vault.getRecordFilteredOfType = function(table,filter,value,cb){
    var returnRecords 
    Vault.getAllRecordsOfType(table,function(records){
        for (var i = 0; i < records.rows.length; i++) {
            if (records.rows[i].doc[filter] == value)
                return cb(records.rows[i].doc)
        }
        return cb(returnRecords)
    })
}

Vault.getAddressesByPrivateKeyFormat = function(type,cb){
    var returnRecords = []
    
    Vault.getRecordsFilteredOfType(tables.privkey,"format",type,function(privkeys){
        for (var i = 0; i < privkeys.length; i++) {
            var poi = privkeys[i]
            Vault.getRecordFilteredOfType(tables.address,"privkeyId",privkeys[i]._id,function(address){
                var addressRecord = {address: address, privkey: poi}
                Vault.getRecordOfType(tables.pubkey,address.pubkeyId,function(pubkey){
                    addressRecord.pubkey = pubkey
                    returnRecords.push(addressRecord)
                })
            })
        }
        return cb(returnRecords)
    })
}

/* Utility Extensions */
Array.prototype.contains = function(elem) {
    for (var i in this) {
        if (this[i] == elem) return true;
    }
    return false;
}




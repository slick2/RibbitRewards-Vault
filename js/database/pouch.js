/* App Namespace */
var Vault = {}
/* Methods that apply to a page */
Vault.page = {}
/* My Databases (I know they arent really tables) */
var tables = {}
var remoteCouch = false;
var verbose = true

tables.address = new PouchDB('vault_address')
tables.address.createIndex({
  index: {
    fields: ['seedId', 'compressed', 'pubkeyId', 'privkeyId', 'addressData', 'format']
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
    fields: ['key']
  }
})
tables.privkey = new PouchDB('vault_privkey')
tables.privkey.createIndex({
  index: {
    fields: ['format', 'key']
  }
})
tables.channel = new PouchDB('vault_channel')
tables.channel.createIndex({
  index: {
    fields: ['securitylevel', 'pubkeyIds', 'privkeyIds', 'addressIds', 'name']
  }
})

tables.settings = new PouchDB('vault_settings')
tables.settings.createIndex({
  index: {
    fields: ['key', 'value']
  }
})
Vault.tables = tables

/* Domain specific gets*/
Vault.getAllRecordsOfType = function(table, cb){
    table.allDocs({include_docs: true, descending: true}, function(err, doc) {
        cb(doc)
     });
}

Vault.getRecordOfType = function(table,id,cb) {
        table.get(id).then(function (doc) {
          return cb(doc)
        }).catch(function (err) {
        if (verbose) console.log(err)
        return cb(err);
    })
}

/* ADD Records */
Vault.page.saveAddress = function(cb) {
    var payload = {}
    if ($("#newBitcoinAddress:visible()").length > 0) {
        payload.address = $("#newBitcoinAddress").val()
        payload.pubkey = $("#newPubKey").val()
        payload.encrypted = $("#encryptKey:checked").length != 0
        if (payload.encrypted)
            payload.privkey = $("#newPrivKeyEnc").val()
        else
            payload.privkey = $("#newPrivKey").val()
            
        payload.compressed = $("#newCompressed:checked").length != 0
        payload.identity = false;
        payload.type = "standard"

        if ($("#newBrainwallet:checked").length != 0 && $("#brainwallet").val() != "")
            payload.seed = $("#brainwallet").val()

        Vault.insertAddress(payload, function(row) {
            return cb(row)
        })
    }
}

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
                Vault.addAddress("",addressInsertData.compressed,addressInsertData.encrypted, addressInsertData.location,addressInsertData.pubkeyId, addressInsertData.privkeyId, addressInsertData.seedId, addressInsertData.address, addressInsertData.type, function(row){
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

Vault.addSetting = function(key, value, cb) {
    var kvp = {
        _id: new Date().toISOString(),
        key: key,
        value: value
    }
    Vault.getSettingValue(key,function(value){
        if (value === undefined || value === null) {
            tables.settings.put(kvp, function callback(err, result) {
                if (!err) {
                  if (verbose) console.log('Successfully added a setting!');
                  if (verbose) console.log(result)
                  return cb(result)
                } else {
                    if (verbose) console.log(err)
                    return cb(err)
                }
            })
        } else {
            console.log("already exists - Updating")
            value.value == kvp.value
            tables.settings.put(kvp, function callback(err, result) {
                if (!err) {
                  if (verbose) console.log('Successfully added a setting!');
                  if (verbose) console.log(result)
                  return cb(result)
                } else {
                    if (verbose) console.log(err)
                    return cb(err)
                }
            })            
        }
    })    
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
        format : type,
        addressData : addressData,
        
    }
  tables.address.put(address, function callback(err, result) {
    if (!err) {
      if (verbose) console.log('Successfully added an address!');
      if (verbose) console.log(result)
      return cb(result)
    } else {
        if (verbose) console.log(err)
        return cb(err)
    }
  })
}

Vault.addPrivateKey = function(format, keydata, cb) {
    var privateKey = {
        _id: new Date().toISOString(),
        format: format,
        keydata: keydata
    }
  tables.privkey.put(privateKey, function callback(err, result) {
    if (!err) {
      if (verbose) console.log('Successfully added an privateKey!');
      return cb(result)
    } else {return cb(err)}
  });
}

Vault.addPublicKey = function(keydata, owner, cb) {
    var publicKey = {
        _id: new Date().toISOString(),
        keydata: keydata,
        owner: owner
    }
  tables.pubkey.put(publicKey, function callback(err, result) {
    if (!err) {
      if (verbose) console.log('Successfully added an publicKey!');
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
      if (verbose) console.log('Successfully added an multisig!');
      return cb(result)
    } else {return cb(err)}
  });
}

Vault.addChannel = function(pubkeyIds, privkeyIds, addressIds, name, label, securitylevel, cb) {
    var channel = {
        _id: new Date().toISOString(),
        pubkeyIds: pubkeyIds,
        privkeyIds: privkeyIds,
        addressIds: addressIds,
        name: name,
        label: label,
        securitylevel: securitylevel
    }
  tables.channel.put(channel, function callback(err, result) {
    if (!err) {
      if (verbose) console.log('Successfully added an channel!');
      return cb(result)
    } else {
        return cb(err)
    }
  });
}

/* Database Get Methods */

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
            Vault.getRecordFilteredOfType(tables.address,"privkeyId",privkeys[i]._id, function(address){
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

Vault.getSettingValue = function getSettingValue(key,cb){
    Vault.getRecordFilteredOfType(tables.settings, "key", key, function(record){
        if (record !== undefined)
            return cb(record.value)
        else 
            return cb(null)
    })
}

/* DATATABLE GETS */
function getTableAsDataTableRows(table,cb) {
	Vault.getAllRecordsOfType(table, function(records) {
		var dataTableObject = {
			rows: []
		}
		var rawRecords = records.rows
		$.each(rawRecords, function(item) {
			if (item != 0)
				dataTableObject.rows.push(rawRecords[item].doc)
			if (rawRecords.length - 1 == item)
				cb(dataTableObject)
		})
	})
}

function getPubkeyAsDataTable(cb) {
	getTableAsDataTableRows(tables.pubkey, function(rows){
		cb(rows)
	})
}

function getPrivkeyAsDataTable(cb) {
	getTableAsDataTableRows(tables.privkey, function(rows){
		cb(rows)
	})
}

function getAddressAsDataTable(cb) {
	getTableAsDataTableRows(tables.address, function(rows){
		cb(rows)
	})
}

function getMultisigAsDataTable(cb) {
	getTableAsDataTableRows(tables.multisig, function(rows){
		cb(rows)
	})
}

function getAllTablesAsDataTable(cb) {	
	var KeyData = {}
	getPubkeyAsDataTable(function(pubkey){
		KeyData.pubkey = pubkey
		getPrivkeyAsDataTable(function(privkey){
			KeyData.privkey = privkey
			getAddressAsDataTable(function(address){
				KeyData.address = address
				cb(KeyData)
			})
		})
	})
}

/* DATATABLE GETS */

/* Utility Extensions */
Array.prototype.contains = function(elem) {
    for (var i in this) {
        if (this[i] == elem) return true;
    }
    return false;
}




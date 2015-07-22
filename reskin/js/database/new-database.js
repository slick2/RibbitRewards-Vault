var newtables = {}
newtables.settings = setupTableObject('vault_settings')
newtables.address = setupTableObject('vault_address')
newtables.multisig = setupTableObject('vault_multisig')
newtables.pubkey = setupTableObject('vault_pubkey')
newtables.privkey = setupTableObject('vault_privkey')
newtables.privkey.newHD = getnewHDKey(newtables.privkey.table, false)
newtables.privkey.importHD = getimportHDKey(newtables.privkey.table, false)
newtables.privkey.newIdentity = getnewHDKey(newtables.privkey.table,true)
newtables.privkey.signMessage = getsignMessage(newtables.privkey.table)
newtables.privkey.verifyMessage = getverifyMessage(newtables.privkey.table)
newtables.channel = setupTableObject('vault_channel')
newtables.peers = setupTableObject('vault_peers')
newtables.peers.offline = getoffline(newtables.peers.table)
newtables.peers.online = getonline(newtables.peers.table)
newtables.peers.tofriend = gettofriend(newtables.peers.table)
newtables.peers.unfriend = getunfriend(newtables.peers.table)

function setupTableObject(tablename) {
    var obj = {}
    obj.table = new top.PouchDB(tablename, { auto_compaction: true })
    obj.insert = getupsert(obj.table)
    obj.get = getget(obj.table)
    obj.getOrDefault = getgetOrDefault(obj.table)
    obj.destroy = getdestroy(obj.table)
    obj.remove = getremove(obj.table)
    obj.keys = getkeys(obj.table)
    obj.allRecords = getallRecords(obj.table)
    obj.allRecordsArray = getallRecordsArray(obj.table)
    return obj
}

/* Peer Storage */
/* moved to mesh */
/*function peerJoin(data) {
    data.online = true;
    newtables.peers.insert(data.address, data, function(err, doc) {
        renderChatList()
    })
}*/


/* Database Convenience Methods */
function getupsert(database) {
    return function (key, value, cb) {
        if (cb === undefined) { cb = simple }
        return upsert(database, key, value, cb)
    }
}
function upsert(db, key, value, cb) {
    get(db, key, function (err, doc) {
        if (err) {
            return insert(db, key, value, cb)
        }
        db.put({
            _id: key,
            _rev: doc._rev,
            value: value
        }, function (err, response) {
            if (err) {
                return cb(err)
            }
            return cb(response)
        })
    })
}

function getget(database) {
    return function (key, cb) {
        if (cb === undefined) { cb = simple }
        return get(database, key, cb)
    }
}
function get(db, key, cb) {
    db.get(key, function (err, doc) {
        return cb(err, doc)
    })
}

function getoffline(database) {
    return function (key, cb) {
        if (cb === undefined) { cb = simple }
        return offline(database, false, key, cb)
    }
}
function getonline(database) {
    return function (key, cb) {
        if (cb === undefined) { cb = simple }
        return offline(database, true, key, cb)
    }
}

function offline(db, state, key, cb) {
    var insert = getupsert(db)
    db.allDocs({
        include_docs: true
    }, function (err, response) {
        if (err) { return cb(err); }
        console.log(response)
        $.each(response.rows, function (index, value) {
            if ($(this)[0].doc.value.peerid === key || key === null) {
                var doc = $(this)[0].doc.value
                doc.online = state;
                insert(doc.address, doc, function(resp) {
                    if (key !== null || index === ( response.rows.length -1) )
                    return cb(resp)
                })
            }
        })
    })
}

function gettofriend(database) {
    return function (key, cb) {
        if (cb === undefined) { cb = simple }
        return setfriend(database, true, key, cb)
    }
}

function getunfriend(database) {
    return function (key, cb) {
        if (cb === undefined) { cb = simple }
        return setfriend(database, false, key, cb)
    }
}

function setfriend(db, state, key, cb) {
    var insert = getupsert(db)
    db.allDocs({
        include_docs: true
    }, function (err, response) {
        if (err) { return cb(err); }
        console.log(response)
        $.each(response.rows, function (index, value) {
            if ($(this)[0].doc.value.address === key || key === null || $(this)[0].doc.value.isfriend === undefined) {
                var doc = $(this)[0].doc.value
                doc.isfriend = state;
                insert(doc.address, doc, function (resp) {
                    if (key !== null || index === (response.rows.length - 1))
                        return cb(resp)
                })
            }
        })
    })
}


function getnewHDKey(database, isIdentity) {
    return function (name, cb) {
        if (isIdentity === undefined) { isIdentity = false }
        if (cb === undefined) { cb = simple }
        return newHDKey(database, isIdentity, name, cb)
    }
}

function newHDKey(db, isIdentity, name,  cb) {
    var key = new bitcore.HDPrivateKey()
    var insert = getupsert(db)
    var payload = {}
    payload.isIdentity = isIdentity
    payload.key = key
    payload.label = name
    insert(key.toString(), payload, function(record) {
         return cb(record)
    })
}

function getimportHDKey(database, isIdentity) {
    return function (importKey, cb) {
        if (isIdentity === undefined) { isIdentity = false }
        if (cb === undefined) { cb = simple }
        return importHDKey(database, importKey, isIdentity, cb)
    }
}

function importHDKey(db, importKey, isIdentity, cb) {
    var key = new bitcore.HDPrivateKey(importKey)
    var insert = getupsert(db)
    var payload = {}
    payload.isIdentity = isIdentity
    payload.key = key
    insert(key.toString(), payload, function (record) {
        return cb(record)
    })
}

function signMessage(msg, cb, idx) {
    
}

function getsignMessage(database) {
    return function(msg, cb, idx) {
        if (idx === undefined) { idx = 0 }
        if (cb === undefined) { cb = simple }
        return signMessage(database, msg, cb, idx)
    }
}

function signMessage(db, msg, cb, idx) {
    var Message = require('bitcore-message');
    var get = getget(db)
    var keys = getkeys(db)
    keys(function (keyrecords) {
        var lookupKey = keyrecords[idx]
        get(lookupKey, function (err, record) {
            var hdkey = bitcore.HDPrivateKey(record.value.key.xprivkey)
            var privateKey = hdkey.privateKey
            var address = privateKey.toAddress().toString()
            var signature = Message(msg).sign(privateKey);
            return cb(address, signature)
        })
    })
}
function getverifyMessage(database) {
    return function (msg, address, signature, cb) {
        if (cb === undefined) { cb = simple }
        return verifyMessage(database, msg, address, signature, cb)
    }
}
function verifyMessage(db, msg, address, signature, cb) {
    var Message = require('bitcore-message');
    var verified = Message(msg).verify(address, signature);
    return cb(verified)
}



function getgetOrDefault(database) {
    return function (key, defaultvalue, cb) {
        if (cb === undefined) { cb = simple }
        return getOrDefault(database, key, defaultvalue, cb)
    }
}
function getOrDefault(db, key, defaultvalue, cb){
    get(db,key, function(err, doc) {
        if (err) {
            return insert(db, key, defaultvalue, function(response) {
                cb(err, response)
            })
        } else {
            return cb(err, doc)
        }
    })
}

function getinsert(database) {
    return function (key, value, cb) {
        if (cb === undefined) { cb = simple }
        return insert(database, key, value, cb)
    }
}
function insert(db, key, value, cb) {
    var upsertCollection = getupsertCollection(db)
    db.put({
        _id: key,
        value: value
    }, function (err, response) {
        if (err) { return console.log(err) }
        upsertCollection("keys", key, function () {
            return cb(response)
        })
    })
}

function getupsertCollection(database) {
    return function (key, value, cb) {
        if (cb === undefined) { cb = simple }
        return upsertCollection(database, key, value, cb)
    }
}
function upsertCollection(db, key, value, cb) {
    var get = getget(db)
    var insert = getinsert(db)
    get(key, function (err, doc) {
        if (err) {
            return insert(key, [value], cb)
        }
        if (key === "keys" && value === "keys") {
            return cb()
        }
        var collection = doc.value
        collection.push(value)
        db.put({
            _id: key,
            _rev: doc._rev,
            value: collection
        }, function (err, response) {
            if (err) {
                return cb(err)
            }
            return cb(response)
        })
    })
}

function removeFromCollection(db, key, value, cb) {
    var get = getget(db)
    get(key, function (err, doc) {
        if (err) {
            return cb(err)
        }
        var collection = doc.value
        var index = collection.indexOf(value)
        if (index > -1) {
            collection.splice(index, 1);
        }
        db.put({
            _id: key,
            _rev: doc._rev,
            value: collection
        }, function (err, response) {
            if (err) {
                return cb(err)
            }
            return cb(response)
        })
    })
}

function getdestroy(database) {
    return function (cb) {
        if (cb === undefined) { cb = simple }
        return destroy(database, cb)
    }
}
function destroy(db, cb) {
    db.destroy(function (error) {
        if (error) {
            return cb(error);
        } else {
            return cb("success")
        }
    });
}

function getremove(database) {
    return function (key, cb) {
        if (cb === undefined) { cb = simple }
        return remove(database, key, cb)
    }
}
function remove(db, key, cb) {
    db.get(key, function (err, doc) {
        if (err) { return cb(err); }
        db.remove(doc, function (err, response) {
            if (err) { return cb(err) }
            removeFromCollection(db, "keys", key, function (res) {
                return cb(response)
            })
                    
        });
    });
}

function getkeys(database) {
    return function (cb) {
        return keys(database, cb)
    }
}
function keys(db, cb) {
    if (cb === undefined) { cb = simple }
    get(db, "keys", function (err, doc) {
        if (err) { return cb(err) }
        return cb(doc.value)
    })
}

function getallRecords(database) {
    return function (cb) {
        if (cb === undefined) { cb = simple }
        return allRecords(database, cb)
    }
}
function allRecords(db, cb) {
    var records = {}
    keys(db, function (outs) {
        for (var index = 0; index < outs.length; ++index) {
            get(db, outs[index], function (err, doc) {
                records[doc._id] = doc.value
                if (doc._id === outs[index - 1]) {
                    return cb(records)
                }
            })
        }
    })
}

function getallRecordsArray(database) {
    return function (cb) {
        if (cb === undefined) { cb = simple }
        return allRecordsArray(database, cb)
    }
}

function allRecordsArray(db, cb) {
    var records = []
    keys(db, function (outs) {
        for (var index = 0; index < outs.length; ++index) {
            get(db, outs[index], function (err, doc) {
                records.push(doc.value)
                if (doc._id === outs[index - 1]) {
                    return cb(records)
                }
            })
        }
    })
}

function getPublicIdentity(cb) {
    var payload = {}
    //public picture
    newtables.settings.get("profileImagepublic", function(err, publicdata) {
        newtables.settings.get("profileImage", function (err, data) {
            if (publicdata.value) {payload.photo = data.value}
            newtables.settings.get("namepublic", function (err, publicdata) {
                newtables.settings.getOrDefault("name","", function (err, data) {
                    if (publicdata.value) { payload.name = data.value }
                    newtables.settings.get("nicknamepublic", function (err, publicdata) {
                        newtables.settings.getOrDefault("nickname", "", function (err, data) {
                            if (publicdata.value) { payload.nickname = data.value }
                            newtables.settings.get("socialpublic", function (err, publicdata) {
                                newtables.settings.getOrDefault("social", "", function (err, data) {
                                    if (publicdata.value) { payload.social = data.value }
                                    newtables.settings.get("biopublic", function (err, publicdata) {
                                        newtables.settings.getOrDefault("bio", "", function (err, data) {
                                            if (publicdata.value) { payload.bio = data.value }
                                    return cb(payload)
                                        })
                                    })
                                })
                            })
                        })
                    })
                })
            })
        })
    })
    /*if (data.value) {
        newtables.settings.get("profileImage", function (err, data) {
            payload.photo = (data.value)
            return cb(payload)
        })
    } else {
        cb(payload)
    }*/
}

function simple(out) {
    console.log(out)
    return out
}
function simple(err, out) {
    console.log(err, out)
    return out
}

function databaseDebug(state) {
    if (state === undefined) state = true;
    if (!state) {
        PouchDB.debug.disable()
    } else {
        PouchDB.debug.enable('*');
    }
}
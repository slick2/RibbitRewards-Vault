var newtables = {}
newtables.settings = setupTableObject('vault_settings')
newtables.address = setupTableObject('vault_address')
newtables.multisig = setupTableObject('vault_multisig')
newtables.pubkey = setupTableObject('vault_pubkey')
newtables.privkey = setupTableObject('vault_privkey')
newtables.channel = setupTableObject('vault_channel')
newtables.peers = setupTableObject('vault_peers')
newtables.peers.offline = getoffline(newtables.peers.table)

function setupTableObject(tablename) {
    var obj = {}
    obj.table = new PouchDB(tablename, { auto_compaction: true })
    obj.insert = getupsert(obj.table)
    obj.get = getget(obj.table)
    obj.getOrDefault = getgetOrDefault(obj.table)
    obj.destroy = getdestroy(obj.table)
    obj.remove = getremove(obj.table)
    obj.keys = getkeys(obj.table)
    obj.allRecords = getallRecords(obj.table)
    return obj
}

/* Peer Storage */
function peerJoin(data) {
    data.online = true;
    newtables.peers.insert(data.address, data, function(err, doc) {
        renderChatList()
    })
}


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
        return offline(database, key, cb)
    }
}
function offline(db, key, cb) {
    var insert = getupsert(db)
    db.allDocs({
        include_docs: true
    }, function (err, response) {
        if (err) { return cb(err); }
        console.log(response)
        $.each(response.rows, function () {
            if ($(this)[0].doc.value.peerid === key) {
                var doc = $(this)[0].doc.value
                doc.online = false;
                insert(doc.address,doc,function(resp) {
                    return cb(resp)
                })
            }    
        })
    })
    /*db.get(key, function (err, doc) {
        doc.online = false
        var insert = getinsert(db)
        insert(key,doc, function(err, doc) {
            return cb(err, doc)
        })
    })*/
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

function getPublicIdentity(cb) {
    var payload = {}
    //public picture
    newtables.settings.get("picturepublic", function(err, publicdata) {
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
                                    return cb(payload)
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
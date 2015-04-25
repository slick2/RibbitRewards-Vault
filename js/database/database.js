var Vault = {}
var db
var database = {}
var page = {}
var verbose = false
database.db = db
Vault.database = database
Vault.page = page

Vault.init = function(cb){
    if (db == null) {
        db = $.db("keys", "1.0", "Local Keystore", 1024 * 1024);
        return cb()
    } else {
        return cb()
    }
}

function init(){
    Vault.init(function(){
        console.log("initialized")
    })
}

Vault.page.saveAddress = function(cb) {
    var payload = {}
    payload.address = $("#newBitcoinAddress").val()
    payload.pubkey = $("#newPubKey").val()
    payload.encrypted = $("#encryptKey:checked").length != 0
    if (payload.encrypted)
        payload.privkey = $("#newPrivKeyEnc").val()
    else
        payload.privkey = $("#newPrivKey").val()
    
    payload.compressed = $("#newCompressed:checked").length != 0
    
    if ($("#newBrainwallet:checked").length != 0 && $("#brainwallet").val() != "")
        payload.seed = $("#brainwallet").val()
    
    Vault.insertAddress(payload, function(row, error){
        return cb(row,error)
    })
}

Vault.insertAddress = function(payload, cb) {
    init()
    var addressInsertData = payload
    var pubkeyInsertData = {key: payload.pubkey}
    var privkeyInsertData = {format : "WIF", key : payload.privkey}
    var handleKeyAndAddress =  function(){
        Vault.database.insertAndReturnRecord("pubkey",pubkeyInsertData,"key",payload.pubkey, function(transaction, error, row) {
            if (verbose) console.log(row || error)
            if (error)
                return cb(row, error)
            addressInsertData.pubkeyId = row.id
            delete addressInsertData.pubkey
            Vault.database.insertAndReturnRecord("privkey",privkeyInsertData,"key",payload.privkey, function(transaction, error, row) {
                if (verbose) console.log(row || error)
                if (error)
                    return cb(row, error)
                addressInsertData.privkeyId = row.id
                delete addressInsertData.privkey
                 Vault.database.insertAndReturnRecord("address",addressInsertData, "address", payload.address, function(transaction, error, row){
                    if (verbose) console.log(row || error)
                    return cb(row, error)
                })
            })
        })
    }
    if (payload.seed != null) {
        Vault.database.insertAndReturnRecord("privkey",{format: "brain", key: payload.seed},"key",payload.seed, function(transaction, error, row) {
            addressInsertData.seedId = row.id
            delete addressInsertData.seed
            
            handleKeyAndAddress()
        })
    } else {
        handleKeyAndAddress()
    }
}

Vault.bootstrap = function(cb){
    Vault.database.deleteTable({name: "multisig"},function(){console.log("multisig dropped")})
    Vault.database.deleteTable({name: "pubkey"},function(){console.log("pubkey dropped")})
    Vault.database.deleteTable({name: "privkey"},function(){console.log("privkey dropped")})
    Vault.database.deleteTable({name: "address"},function(){console.log("address dropped")})
    
    Vault.database.createTable({
        name: "multisig",
        columns: [
            "id INTEGER PRIMARY KEY AUTOINCREMENT",
            "script TEXT NOT NULL", //script needed to pay
            "pubkeys TEXT NOT NULL", //[] array of address record ID's
            "address  TEXT" //Multisig address {}
        ]
    },function(){
        Vault.database.createTable({
            name: "pubkey",
            columns: [
                "id INTEGER PRIMARY KEY AUTOINCREMENT",
                "key TEXT" //Public Key string
            ]
        }, function(){
            Vault.database.createTable({
                name: "privkey",
                columns: [
                    "id INTEGER PRIMARY KEY AUTOINCREMENT",
                    "format TEXT", //Extended, HD (seed), WIF
                    "key TEXT", //Private Key string
                ]
            }, function(){
                Vault.database.createTable({
                    name: "address",
                    columns: [
                        "seedId INTEGER", //ID of seed [privkey] record (If HD)
                        "compressed BOOLEAN",
                        "encrypted BOOLEAN",
                        "location TEXT", //(If HD)
                        "pubkeyId INTEGER KEY", //ID of pubkey record
                        "privkeyId INTEGER KEY ", //ID of privkey record
                        "address TEXT PRIMARY KEY NOT NULL" //Address
                    ]
                }, function(){
                    return cb() //All done setting up the database
                })
            })
        })
    })
}

Vault.database.insertRecord = function(table, data,cb) {
    var payload = {}
    payload.data = data
    payload.done = cb
    payload.fail = cb
    db.insert(table,payload)
    cb()
}

Vault.database.insertAndReturnRecord = function(table, data, colname, colvalue, ok) {
    db.insert(table, {
            data: data,
            done: function () {
                db.criteria(table).list(function (transaction, resultSet) {
                    for (var i = 0; i < resultSet.rows.length; i++) {
                        var actual = resultSet.rows.item(i)
                        if (actual[colname] == colvalue)
                            return ok(transaction, null, actual)
                    }

                    ok(actual.hasOwnProperty("other"));
                    //start();
                }, function (transaction, error) {
                    ok(false, error.message);
                    //start();
                });
            },
            fail: function (transaction, error) {
                ok(false, error.message);
                //start();
            }
        });
}

Vault.database.getRowByKey = function(table, colname, colvalue, cb) {
    db.criteria(table).list(
        function (transaction, results) {
            var rows = results.rows;
    
            for (var i = 0; i < rows.length; i++) {
                var row = rows.item(i);
                if (row["colname"] == colvalue)
                    return cb(transaction, null,row)
            }
        },
        function (transaction, error) {
            return cb(transaction, error, null)
        }
    )
}

Vault.database.createTable = function(options,cb) {
    db.createTable(options)
    return cb()
}

Vault.database.deleteTable = function(options,cb) {
    db.dropTable(options)
    return cb()
}

$(document).ready(function(){
    readyWork()
})

function readyWork(){
    Vault.init(function(){
        db.tables(function(tables) {
            console.log("Tables: "+tables);
            if (!tables.contains("multisig")) {
                console.log("Missing tables: => bootstraping")
                Vault.bootstrap(function(){
                    return readyWork()
                })
            }
        });
    })
}

/* Utility Extensions */
Array.prototype.contains = function(elem)
{
   for (var i in this)
   {
       if (this[i] == elem) return true;
   }
   return false;
}



var Database = {}
var server

Database.open = function() {
    db.open({
        server: 'Vault',
        version: 1,
        schema: {
            address: {
                key: { keyPath: 'id', autoIncrement: true },
                // Optionally add indexes
                /*indexes: {
                    firstName: {},
                    answer: {
                        unique: true
                    }
                }*/
            }
        }
    }).done(function(s) {
        server = s
    });
}
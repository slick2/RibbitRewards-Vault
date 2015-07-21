var me = {}
me.data = newtables
me.friends = function(cb) {
    var friends = []
    newtables.peers.allRecordsArray(function (results) {
        $.each(results, function (k, v) {
            if (this.isfriend) { friends.push(this) }
            if (results.length - 1 === k) {
                return cb(friends)
            }
        })
    })
}
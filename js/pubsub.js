function publish() {

    var address =
        pubnub = PUBNUB.init({
            publish_key: 'pub-c-bdf47ac2-b687-4918-a720-bb2d3a1b204f',
            subscribe_key: 'sub-c-360460ce-eca5-11e4-aafa-0619f8945a4f'
        })

    Identity.getIdentityAddress(function(addy) {
        address = addy
        pubnub.subscribe({
                channel: addy,
                message: function(message, env, channel) {
                popMsg(JSON.stringify(message))
            },
            connect: pub
        })
    })

    function pub() {
        pubnub.publish({
            channel: address,
            message: "Your receive channel is: "+foundIdentity[0].address.addressData,
            callback: function(m) {
                console.log("m: "+m)
            }
        })
    }
    
    subscribeToBlockchain()
}

 function popMsg(msg) {
        $('.top-right').notify({ message: { text: msg },type: "blackgloss" }).show()
}

function subscribeToBlockchain(){
    var eventToListenTo = 'tx'
    var room = 'inv'

    var socket = io("http://ribbitchain.info:80/");
    socket.on('connect', function() {
      // Join the room.
      socket.emit('subscribe', room);
    })
    socket.on(eventToListenTo, function(data) {
        var msg = "Blockchain registered new TX: " + data.txid
      console.log(msg)
      popMsg(msg)
    })
}
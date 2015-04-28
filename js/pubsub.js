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
            message: "You have successfully registered your identity as a channel",
            callback: function(m) {
                console.log("m: "+m)
            }
        })
    }
    
    function popMsg(msg) {
        $('.top-right').notify({ message: { text: msg },type: "blackgloss" }).show()
     }
}
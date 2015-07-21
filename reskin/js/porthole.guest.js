var windowProxy;
window.onload = function () {
    // Create a proxy window to send to and receive 
    // messages from the parent
    windowProxy = new Porthole.WindowProxy(
        'proxy.html');
    
    // Register an event handler to receive messages;
    windowProxy.addEventListener(onMessage);
};

function onMessage(messageEvent) {
    var cmd = messageEvent.data.command
    var payload = messageEvent.data.payload
    console.log("Guest received command: "+cmd) 
    console.log(payload)

    switch (cmd) {
        case "contextSwitch":
            var updateCoinTo = payload.network.name
            var short = "rbr"
            if (updateCoinTo === "livenet") {
                updateCoinTo = "bitcoin"
                short = "btc"
            }
            top.settings.currentcoin = { "name": updateCoinTo, "short": short }
            loadAddressPicker()
            top.bitcore.Networks.AvailableNetworks.set(updateCoinTo)
            top.insight = top.bitcore.Networks.AvailableNetworks.currentNetwork().insight
            top.settings.currentcoin = { name: updateCoinTo, short: short }
            top.bitcore.Networks.AvailableNetworks.set(updateCoinTo)
            $("#toAddress").val("")

            break;
        case "loadAddressPicker":
            loadAddressPicker()
            break;
        case "scannedQR": 
            $("#toAddress").val(payload.replace('bitcoin:', ''))
            break;
    }
}
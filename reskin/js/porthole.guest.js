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
    
    if (cmd === "contextSwitch") {
        //insight = payload
        var updateCoinTo = payload.network.name
        var short = "rbr"
        if (updateCoinTo === "livenet") {
            updateCoinTo = "bitcoin"
            short = "btc"
        }
        //newtables.settings.insert("currentcoin", { "name": updateCoinTo, "short": short }, function(response) {
            //console.log(response)
            top.settings.currentcoin = { "name": updateCoinTo, "short": short }
            //settings.currentcoin = { "name": updateCoinTo, "short": short }
            loadAddressPicker()
        //})
        /*Vault.addSetting("currentcoin", { name: updateCoinTo, short: short }, function () {
            loadAddressPicker()
        })*/
        top.bitcore.Networks.AvailableNetworks.set(updateCoinTo)
        top.insight = top.bitcore.Networks.AvailableNetworks.currentNetwork().insight
        top.settings.currentcoin = { name: updateCoinTo, short: short }
        top.bitcore.Networks.AvailableNetworks.set(updateCoinTo)
        //insight = top.bitcore.Networks.AvailableNetworks.currentNetwork().insight
        //settings.currentcoin = { "name": updateCoinTo, "short": short }
    } else if (cmd === "loadAddressPicker") {
        loadAddressPicker()
    } else if (cmd === "scannedQR") {
        $("#toAddress").val(payload.replace('bitcoin:',''))
    }
}
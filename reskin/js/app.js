 /* Globals */
var bitcore, ECIES, explorers, insight, transaction, qrcode, p2p, message, node
var settings = {}
var foundIdentity = {}
var lazyCheck, getDisplayName, checkLocalIdentity
var check = function (cb) {
    Vault.getAddressesByPrivateKeyFormat("Extended Identity", function (keys) {
        foundIdentity = keys
        return cb()
    })
}
var onPage = function () {
    var page, title
    var hash = window.location.hash.replace('#', '')
    if (hash === "") {
        hash = window.location.pathname.replace("/", "").split(".")[0]
    }
    switch (hash) {
        case "wallet":
            page = "wallet.html"
            title= "Wallet"
            break;
        case "keys":
            page = "keys.html"
            title="Key Management"
            break;
        case "video-chat":
            page = "video-chat.html"
            title = "Chat / Video"
            break;
        case "raw":
            page = "raw.html"
            title = "Create a raw transaction"
            break;
        case "import":
            page = "import.html"
            title="Import / Export"
            break;
        case "address":
            page = "address.html"
            title = "Generate Addresses"
            break;
        case "settings":
            page = "settings.html"
            title = "Settings"
            break;
        default:
            page = "profile.html"
            title="Profile"
            break;
    }
    return {page: page, title: title}
}
/* Entry */
$(document).ready(function () {
    handleSettings(function () {
        preInit(function () {
            check(function () {
                setTimeout(function () { $(".navmenu").fadeIn("slow") }, 900)
                if (verbose) console.log("done checking identity")
                initApplication()

            })
        })
    })
})

function handleSettings(cb) {
    settings.onPage = onPage()
    settings.inFrame = function() {
        return top !== window
    }

    var loadApplication = 
    //getOrSetSetting(settings.onPage.title.toLowerCase() + "advanced", false, function (setting) {
        //settings.onPage.advanced = setting
        getOrSetSetting("displayname", "", function (setting) {
            settings.displayname = setting
            getOrSetSetting("currentcoin", { name: "ribbit", short: "rbr" }, function (setting) {
                settings.currentcoin = setting
                return appendAllSettings(cb)
            })
        })
    //})
    
    //onboarding first
    getOrSetSetting("onboard", {seen:"false",level:0,dismissed:false}, function(setting) {
        settings.onboard = setting
        loadApplication
    })
}

function appendAllSettings(cb) {
    getSettingsAsDataTable(function (d) {
        var records = d.rows
        $.each(records, function (item) {
            settings[records[item].key] = records[item].value
            //console.log(records[item].key + " " + records[item].value)
        })
         //return console.log(d.rows)
    })
    return cb()
}

function getOrSetSetting(settingname, settingdefault, cb) {
    Vault.getSettingValue(settingname, function (val) {
        if (val === null) {
            Vault.addSetting(settingname, settingdefault, function () { })
            return cb(false)
        } else {
            return cb(val)
        }
    })
}

/* Iframe */
iframeLoaded = function() {
    console.log("loaded iframe content")
    /* Cleanup Canvas size */
    $(".canvas").width($(window).width() - Number(offset()))
    var options = {}
    if (verbose) options.log = true
    iFrameResize(options)
}

/* Functions */
var preInit = function(cb) {

    bitcore = require('bitcore')
    ECIES = require('bitcore-ecies')
    explorers = require('bitcore-explorers-multi')
    //p2p = require('bitcore-p2p')
    //message = require('bitcore-message')
    //Vault.getSettingValue("currentcoin", function (current) {
    var current = settings.currentcoin
    if (current != null) {
        //insight = new explorers.Insight(current.name)
        bitcore.Networks.AvailableNetworks.set(current.name)
        insight = bitcore.Networks.AvailableNetworks.currentNetwork().insight
        switchCoinImage(current.short, current.name)
        //popMsg("Wallet context changed to " + current.name)

    } else {
        insight = new explorers.Insight("ribbit")
        bitcore.Networks.AvailableNetworks.set("ribbit")
        //popMsg("Wallet context changed to Ribbit Rewards")
    }
    //})

    transaction = new bitcore.Transaction()
    qrcode = new QRCode("qrcode")

    handleMenuToggle()
    loadPageByHash()

    lazyCheck = function() {
        setTimeout(function() { checkLocalIdentity() }, 5000)
    }
    lazyCheck()
    getDisplayName = function(element) {
        Vault.getSettingValue("DisplayName", function(setting) {
            if (setting !== undefined) {
                element.val(setting)
            }
        })
    }
    checkLocalIdentity = function() {
        if (foundIdentity.length === 0) {
            Vault.saveHDAddress(true, function() {
                if (verbose) console.log("Created a new identity")
                check(function() {
                    console.log("checked identity again")
                    lazyCheck()
                })
            })
        } else {
            if (verbose) console.log("Using identity address: " + foundIdentity[0].address.addressData)
            $(".identity").html(foundIdentity[0].address.addressData)
            $("#identityAddress").val(foundIdentity[0].address.addressData)
            joinIdentity()
        }
    }
    explorers = require('bitcore-explorers-multi')
    adjustDesign()
    cb()
}

var offset = function() {
     return $(".canvas").attr("style").replace("left:", "").replace("px;", "").trim().split(" ")[0]
}

var handleMenuToggle = function() {
    setTimeout(function () {
        if ($(".canvas").hasClass("canvas-slid")) {
            setTimeout(function (){$(".coin-sellect").css("display", "inherit")},700)
            $('.menu-item').removeClass('bounceOutLeft')
            $('.menu-item').addClass('animated bounceInLeft')
            //sm
            $('.menu-item-sm').removeClass('bounceInLeft')
            $('.menu-item-sm').addClass('animated bounceOutLeft')
        } else {
            $('.menu-item').removeClass('bounceInLeft')
            $('.menu-item').addClass('animated bounceOutLeft')
            //sm
            $('.menu-item-sm').removeClass('bounceOutLeft')
            $('.menu-item-sm').addClass('animated bounceInLeft')
           
        }
    }, 500)
}

var getQueryStringParam = function(target) {
    var queryDict = {}
    location.search.substr(1).split("&").forEach(function (item) { queryDict[item.split("=")[0]] = item.split("=")[1] })
    return queryDict[target]
}

var loadPageByHash = function () {
    var pageData = onPage()
    if (pageData.page === "video-chat.html" && getQueryStringParam("call") !== undefined) {
        pageData.page = pageData.page + "?call=" + getQueryStringParam("call")
    }
    if ($("iframe").length > 0) {
        $("iframe").attr("src", pageData.page)
        $(".page-header h1").text(pageData.title)
    } else {
        setTimeout(function(){handleSettingsElementFromStore()},500)
    }
    handleSettings(function() {})
}

function setSetting(value,target,type,cb) {
    Vault.addSetting(target + type, value, function () { 
        handleSettings(function () {
            return cb()
        })
    })
}

function adjustDesign() {
    $("#wrap, .menu-bg").css("margin-bottom", Number("-" + $("footer").height()))
    $(".navmenu").css("max-height", $(window).height() - $("footer").height())
    $(".canvas .container").css("min-height", $(window).height() - ($("footer").height() + 60))
    $(".togglebutton input").css("margin", "5px")
    $("iframe").height($(".canvas .container").height() - $("footer").height())
/*    $(".togglebutton label").css("margin-top","15px")*/
}

function handleSettingsElementFromStore() {
    matchPageSettingsToDatastore($(this))
    /*$.each($(".togglebutton input"), function () {
        var togglefor = $(this).attr("for")
        var target = $(this).attr("toggletype")
        
        $(this).prop("checked", settings[togglefor + target])
        if (target === "advanced" && settings[togglefor + target]) {
            $(".advanced").show()
        }
    })*/
}

function handleToggleSettingAction(context) {
    persistSettingToggleToDatastore(context)
    /*var type = context.attr("toggletype")
    var target = context.attr("for")
    var toggle = context
    if (settings.inFrame()) {
        top.setSetting(toggle.is(":checked"), target, type, function () {
            handleSettings(function () { })
        })
            
    } else {
        setSetting(context.is(":checked"), target, type, function () {
            handleSettings(function () { })
        })
    }
    if (toggle.is(":checked")) {
        $(".advanced").show()
    } else {
        $(".advanced").hide()
    }*/
}

function matchPageSettingsToDatastore() {
    $.each($(".togglebutton input"), function () {
        var togglefor = $(this).attr("for")
        var target = $(this).attr("toggletype")
        var toggle = $(this)
        newtables.settings.getOrDefault(togglefor + target,false, function(err, doc) {
            toggle.prop("checked", doc.value)
            if (target === "advanced" && doc.value) {
                $(".advanced").show()
            }
        })
    })
}

function persistSettingToggleToDatastore(context) {
    var togglefor = context.attr("for")
    var target = context.attr("toggletype")
    var toggle = context
    newtables.settings.insert(togglefor + target, context.is(":checked"), function(err,doc) {
        if (toggle.is(":checked")) {
            $(".advanced").show()
        } else {
            $(".advanced").hide()
        }
    })
}

var initApplication = function () {
	/* Video */
    //initVideo(foundIdentity[0].address.addressData)
    initAllTheThings()
    console.log("Init Application")
    $.material.init();
}

function popMsg(msg) {
    if ($("iframe").length > 0 || top === window) {
        $('.top-right').notify({ message: { text: msg }, type: "bangTidy" }).show()
    } else  {top.popMsg(msg)}
}

/************* Click Binding ***************
 * 
 *   Namespaced to allow easy management
 *    Bound to document click so we can
 * bind to elements that might not yet exist
 * 
 * *****************************************/
function bindClicks() {

    /* Unbind by localnamespace togglebutton(Awesome way to unbind a selective everything) */
    $(document).unbind(".customBindings")
    
    $(window).resize(function () {
        adjustDesign()
    });

    /* Navbar toggle */
    $(document).on('click.customBindings', '.navbar-toggle', function() {
        handleMenuToggle()
    })

    $(document).on('click.customBindings', '#profileImage', function () {
       changeProfileImageStock()
    })
    
    /* Change Coin */
    $(document).on('click.customBindings', '.coinSelect', function () {
        hideCoinSelection()
        var newCoin = $(this).attr("data")
        var newCoinName = $(this).attr("name")
        switchCoinImage(newCoin, newCoinName)
        bitcore.Networks.AvailableNetworks.set($(".coinPicker").attr("name"))
        insight = bitcore.Networks.AvailableNetworks.currentNetwork().insight
        Vault.addSetting("currentcoin", { name: newCoinName, short: newCoin }, function () { })
        windowProxy.post({ command: "contextSwitch", payload: insight })
        popMsg("Wallet context changed to " + $(".coinPicker").attr("name"))
    })
    
    $(document).on('click.customBindings', '.navlink', function () {
        setTimeout(function(){loadPageByHash()},500)
    })
    
    $(document).on('click.customBindings', '.togglebutton input', function () {
        handleToggleSettingAction($(this))

    })

    $(document).on('click.customBindings', '.coinPicker', function () {
        showCoinSelection()
    })

    /* Join Chat */
    $("a[href='#lobby']").bind("click.customBindings", function() {
        joinLobby()
    })

    /* Save Generated Address */
    $(document).on('click.customBindings', '#saveKeysBtn', function() {
        saveGeneratedAddress()
    })

    /* UI hotness */
    $(document).on('click.bs.radio.customBindings', '.btn-radio > .btn', function(e) {
        $(this).siblings().removeClass('active');
        $(this).addClass('active');
        handleIdentityViewType($(this))
    })

    /* Save name setting */
    $(document).on('click.customBindings', '.displayNameSave', function() {
        saveNameSetting()
    })

    /* Add / Remove UTXO to/from transaction */
    $(document).on('click.customBindings', '.button-container a', function() {
        if ($(this).hasClass("hit")) {
            $(this).removeClass("hit")
            transaction.removeInput(Number(JSON.parse(JSON.parse($(this).data("index")))))
        } else {
            $(this).addClass("hit")
            transaction.from(JSON.parse(JSON.parse($(this).data("utxo"))))
        }
        $(".transaction-hash").val(transaction.toString())
        if (transaction.toString() === "01000000000000000000") {
            $(".transaction-hash-form").addClass("collapse")
        } else {
            $(".transaction-hash-form").removeClass("collapse")
        }
    })

    /* QR rewrite */
    $(document).on('click.customBindings', ".qrcodeBtn", function() {
        var address = $('.wallet-address-picker .address-view').text()
        if (settings.inFrame()) {
            top.generateQr(address)
            top.showQrModal()
        } else {
            generateQr(address)
            showQrModal()
        }
    });


    /* Address Picker Magic */
    $(document).on('click.customBindings', '.wallet-address-picker .dropdown-menu .address-item', function(data) {
        resetTransaction()
        resetToAmountFields()
        /* Copy link text to root element */
        var address = $(data.currentTarget).attr("data")
        var label = data.currentTarget.text
        $(".output-container").show()
        disableSpendFields()
        $(data.currentTarget.parentNode.parentNode.parentElement).find(".address-view").text(address)
        if (label != null && label !== address) {
            $(".address-label").text(label)
            $(".address-label").addClass("alert-info")
        } else {
            $(".address-label").text("")
            $(".address-label").removeClass("alert-info")
        }
        setSubmitButtonDisabled(true)
        generateQr(address)
        getBalance(address)
    })
    
    /* on Keyup on Change Output Amount */
    $(document).on('change.customBindings', '#output-amount', function () {
       handleAmountInput()
    })
    
    $(document).on('change.customBindings', '#output-address', function() {
        if ($(this).val().length > 0) {
            setSubmitButtonDisabled(false)
        }
    })
    
    /* Address Picker Actions */
    //wallet-action
    $(document).on('click.customBindings', '.wallet-address-picker .dropdown-menu .wallet-action', function (data) {
        if (this.text === "Generate new address") {
            //top.window.location.assign(top.window.location.href.split('#')[0] + "#address")
            //parent.loadPageByHash()
            Vault.saveHDAddress(false, function () {
                loadAddressPicker()
            })
        }
    })

    /* Add output to transaction and sign */
    $(document).on('click.customBindings', '.transaction-add-output', function() {
        var fromAddress = $(".address-view").text()
        var toAddress = $("#output-address").val()
        var amount = $("#output-amount").val() * 100000000
        var key
        try {
            transaction.to(toAddress, amount)
            transaction.change(fromAddress)
            getKeyFromAddress(fromAddress, function(keydata) {
                key = new bitcore.PrivateKey(keydata)
                transaction.sign(key)
                $(".transaction-hash").val(transaction.toString())
                if (transaction.isFullySigned()) {
                    popMsg("Signed and verified")
                } else {
                    popMsg("Transaction is not finished.")
                }
                return
            })
        } catch (e) {
            popMsg("Critical Error: " + e.message)
        }
    })

    /* reset the transaction */
    $(document).on('click.customBindings', '.transaction-reset', function() {
        resetTransaction()
        var address = $(".address-view").text()
        getBalance(address)
    })

    /* Broadcast TX */
    $(document).on('click.customBindings', '.transaction-broadcast', function(data) {
        try {
            if (!transaction.isFullySigned()) {
                console.log("forgot to sign")
                $(".transaction-add-output").click()
            }
            insight.broadcast(transaction, function(err, txid) {
                if (err) {
                    popMsg("Broadcast Error: " + err)
                } else {
                    popMsg("Broadcast Success: " + txid)
                }
            })
        } catch (e) {
            popMsg("Critical: " + e.message)
        }
    })

    /* Port of old coinbin code to new libs
     *
     *            LEGACY CODE
     *
     **************************************/
     
    /* Legacy: Broadcast transaction */
    $(document).on('click.customBindings', '#rawSubmitBtn', function (data) {
        var thisbtn = this;
        $(thisbtn).val('Please wait, loading...').attr('disabled', true)
        var tx = $("#rawTransaction").val()
        try {
            insight.broadcast(tx, function (err, txo) {
                if (err) {
                    $("#rawTransactionStatus").html(err.toString()).removeClass('hidden')
                    $("#rawTransactionStatus").addClass('alert-danger').removeClass('alert-success').prepend('<span class="glyphicon glyphicon-exclamation-sign"></span> ')
                } else {
                    $("#rawTransactionStatus").addClass('alert-success').removeClass('alert-danger')
                    $("#rawTransactionStatus").html('txid: ' + txo)
                }
                $("#rawTransactionStatus").fadeOut().fadeIn()
                $(thisbtn).val('Submit').attr('disabled', false)
            })
        } catch (e) {
            popMsg("Critical Error " + e.message)
            $(thisbtn).val('Submit').attr('disabled', false)
        }
    });
    
    /* Legacy: Generate keys (needs to be ported to bitcore) */
    $(document).on('click.customBindings', '#newKeysBtn', function (data) {
        coinjs.compressed = false;
        if ($("#newCompressed").is(":checked")) {
            coinjs.compressed = true;
        }
        var s = ($("#newBrainwallet").is(":checked")) ? $("#brainwallet").val() : null;
        var coin = coinjs.newKeys(s);
        $("#newBitcoinAddress").val(coin.address);
        $("#newPubKey").val(coin.pubkey);
        $("#newPrivKey").val(coin.wif);
        
        /* encrypted key code */
        if ((!$("#encryptKey").is(":checked")) || $("#aes256pass").val() == $("#aes256pass_confirm").val()) {
            $("#aes256passStatus").addClass("hidden");
            if ($("#encryptKey").is(":checked")) {
                $("#aes256wifkey").removeClass("hidden");
            }
        } else {
            $("#aes256passStatus").removeClass("hidden");
        }
        $("#newPrivKeyEnc").val(CryptoJS.AES.encrypt(coin.wif, $("#aes256pass").val()) + '');
        
        if ($("#autoSave").is(":checked")) {
            saveGeneratedAddress()
        } else {
            popMsg("Generated new address. Don't forget to save.")
        }
    });
}

function showQrModal() {
    $("#modalQrcode").modal("show")
}

function handleAmountInput() {
    resetTransaction()
    var amountField = $("#output-amount")
    var total = Number($(".wallet-address-picker-balance").text().split(" ")[1])
    var value = Number(amountField.val())
    if (value === NaN) {value = 0}
    if (value > total || value < 0.00000001 && amountField.val().length > 0) {
        amountField[0].setCustomValidity('invalid')
        setSubmitButtonDisabled(true)
        amountField.next().text("Must be below or equal to: " + total)
    } else {
        amountField[0].setCustomValidity('')
        setSubmitButtonDisabled(false)
        amountField.next().text(amountField.next().attr("default"))
    }
    
    if (amountField.val().length > 0 ) {
        amountField.removeClass("empty")
    } else {
        amountField.addClass("empty")
    }
    if (amountField.is(":valid")) {
        autoUtxo() //VALID Sign!
    }
}

function disableSpendFields() {
    $("#output-address").prop('disabled', true)
    $("#output-amount").prop('disabled', true)
    //$(".transaction-add-output").prop('disabled', true)
    //$(".transaction-broadcast").prop('disabled', true)
    $(".transaction-reset").prop('disabled', true)
}

function setSubmitButtonDisabled(isDisabled) {
    var notAllowed
    if (!isDisabled && $("#output-address").val().length > 0 && $("#output-amount").val().length > 0 && $("#output-amount:invalid").length === 0) {
        notAllowed = false
    } else {
        notAllowed = true  
    }
    $(".transaction-add-output").prop('disabled', notAllowed)
    $(".transaction-broadcast").prop('disabled', notAllowed)
}

function resetToAmountFields() {
    $("#output-address").val("")
    $("#output-amount").val("")
    handleAmountInput()
}

function enableSpendFields() {
    $("#output-address").prop('disabled', false)
    $("#output-amount").prop('disabled', false)
    //$(".transaction-add-output").prop('disabled', false)
    //$(".transaction-broadcast").prop('disabled', false)
    $(".transaction-reset").prop('disabled', false)
}

function addRule(sheet, selector, styles) {
    if (!sheet) return;
    if (sheet.insertRule) return sheet.insertRule(selector + " {" + styles + "}", sheet.cssRules.length);
    if (sheet.addRule) return sheet.addRule(selector, styles);
}

function switchCoinImage(coin,name) {
    var lastCoinElement = $("[data='" + coin + "']")
    var coinReplacing = $(".coinPicker").attr("data")
    if (coinReplacing === undefined || coin === undefined) {
        return
    }
    var coinReplacingName = $(".coinPicker").attr("name")
    if (coin === "rbr") {
        $(".coinPicker").css("background-size", "55px 55px;")
        /*$(".coinPicker:hover").css("background-size", "55px 55px;")*/
    } else {
        $(".coinPicker").css("background-size", "50px 50px;")
        /*$(".coinPicker:hover").css("background-size", "50px 50px;")*/
        $(".coinPicker").css("margin-left", "5px;")
        /*$(".coinPicker:hover").css("margin-top", "5px;")*/
    }
    $(".coinPicker").css("background-image", "url(./images/SVG/" + coin.toUpperCase() + ".svg)")
    //$(".canvas:after").css("background-image", "url(./images/SVG/" + coin.toUpperCase() + ".svg)")
    addRule(document.styleSheets[0], ".canvas:after", "background-image: url(../images/SVG/" + coin.toUpperCase() + ".svg)");
    $(".coinPicker").attr("data", coin)
    $(".coinPicker").attr("name", name)

    lastCoinElement.css("background-image", "url(./images/SVG/" + coinReplacing.toUpperCase() + ".svg)")
    if (coinReplacing === "rbr") {
        lastCoinElement.css("background-size", "55px 55px;")
    } else {
        lastCoinElement.css("background-size", "50px 50px;")
    }
    lastCoinElement.attr("data", coinReplacing)
    lastCoinElement.attr("name", coinReplacingName)
}

function showCoinSelection() {
    $(".coin-menu").show()
}

function hideCoinSelection() {
    $(".coin-menu").hide()
}

function autoUtxo() {
    var utxo = $(".utxo a")
    var amount = $("#output-amount").val() * 100000000
    var utxoTotal = 0
    if (utxo.length === 0) { return console.log("No outputs to add") }
    if (amount === 0) { return console.log("Amount to spend is zero") }

    $.each(utxo, function () {
        if (utxoTotal >= amount) { return console.log("Done adding inputs") } //Done adding utxo
        utxoTotal += JSON.parse(JSON.parse($(this).attr("data-utxo"))).amount * 100000000
        this.click()
        console.log("TOTAL: " + utxoTotal)
    })
}
function randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}
function changeProfileImageStock() {
    var rnd = randomIntFromInterval(1, 94)
    $("#profileImage").attr("src", "./images/avatars/characters_" + rnd + ".png")
    top.$(".profile-item img").attr("src", "./images/avatars/characters_" + rnd + ".png")
    newtables.settings.insert("profileImage", $("#profileImage").attr("src"), function(err,doc) {
        console.log(doc)
    })
}

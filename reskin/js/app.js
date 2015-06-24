 /* Globals */
var bitcore, ECIES, explorers, insight, transaction, qrcode
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
    var hash = window.location.hash.replace('#','')
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
        default:
            page = "profile.html"
            title="Profile"
            break;
    }
    return {page: page, title: title}
}
/* Entry */
$(document).ready(function () {
    
    preInit(function () {
        
        check(function () {
            setTimeout(function () { $(".navmenu").fadeIn("slow") }, 900)
            if (verbose) console.log("done checking identity")
            initApplication()
        })
    })
    
})

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
var preInit = function (cb) {

	bitcore = require('bitcore')
    ECIES = require('bitcore-ecies')
    explorers = require('bitcore-explorers-multi')
	insight = new explorers.Insight("ribbit")
	transaction = new bitcore.Transaction()
	qrcode = new QRCode("qrcode")
    
    handleMenuToggle()
    loadPageByHash()

    lazyCheck = function(){
        setTimeout(function(){checkLocalIdentity() },5000) 
    }
    lazyCheck()
    getDisplayName = function(element) {
        Vault.getSettingValue("DisplayName",function(setting){
            if (setting !== undefined) {
                element.val(setting)
            }
        })
    }
    checkLocalIdentity = function(){
    	if (foundIdentity.length == 0) {
    		Vault.saveHDAddress(true,function(){
    			if (verbose) console.log("Created a new identity")
    			check(function(){ console.log("checked identity again")
                lazyCheck() })
    		})
    	} else {
    		if (verbose) console.log("Using identity address: "+foundIdentity[0].address.addressData)
    		$(".identity").html(foundIdentity[0].address.addressData)
    		$("#identityAddress").val(foundIdentity[0].address.addressData)
    		joinIdentity()
    	}
    }
    explorers = require('bitcore-explorers-multi')
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
    $("iframe").attr("src", pageData.page)
    $(".page-header h1").text(pageData.title)
}

var initApplication = function () {
	/* Video */
    //initVideo(foundIdentity[0].address.addressData)
    console.log("Init Application")
}

function popMsg(msg) {
    $('.top-right').notify({ message: { text: msg }, type: "bangTidy" }).show()
}

/************* Click Binding ***************
 * 
 *   Namespaced to allow easy management
 *    Bound to document click so we can
 * bind to elements that might not yet exist
 * 
 * *****************************************/
function bindClicks() {

    /* Unbind by localnamespace (Awesome way to unbind a selective everything) */
    $(document).unbind(".customBindings")
    
    /* Navbar toggle */
    $(document).on('click.customBindings', '.navbar-toggle', function() {
        handleMenuToggle()
    })
    
    $(document).on('click.customBindings', '.menu-item', function () {
        setTimeout(function(){loadPageByHash()},500)
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
        generateQr(address)
    });

    /* Address Picker Magic */
    $(document).on('click.customBindings', '.wallet-address-picker .dropdown-menu .address-item', function(data) {
        resetTransaction()
        /* Copy link text to root element */
        var address = data.currentTarget.text
        var label
        if (address.indexOf(' | ') > -1) {
            var splitAddress = address.split(' | ')
            address = splitAddress[1]
            label = splitAddress[0]
        }
        $(data.currentTarget.parentNode.parentNode.parentElement).find(".address-view").text(address)
        if (label != null && label !== undefined) {
            $(".address-label").text(label)
        } else {
            $(".address-label").text("")
        }
        generateQr(address)
        getBalance(address)
    })
    
    /* Address Picker Actions */
    //wallet-action
    $(document).on('click.customBindings', '.wallet-address-picker .dropdown-menu .wallet-action', function (data) {
        if (this.text === "Generate new address") {
            top.window.location.assign(top.window.location.href.split('#')[0] + "#address")
            parent.loadPageByHash()
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


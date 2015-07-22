 /* Globals */
var bitcore, ECIES, explorers, insight, transaction, viewQrcode, p2p, message, node
var settings = {}
var foundIdentity = []
var lazyCheck, getDisplayName, checkLocalIdentity
/*var loading = false*/
/*Vault = top.Vault*/
/*var check = function (cb) {
    Vault.getAddressesByPrivateKeyFormat("Extended Identity", function (keys) {
        foundIdentity = keys
        return cb()
    })
}*/
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
            
                renderChatModule()
                renderPeerChatModule()
            
            setTimeout(function () { $(".navmenu").fadeIn("slow") }, 900)
            initApplication()
        })
    })
})
/* Page is completely loaded */
$(window).load(function() {
/*    loading = false*/
    setTimeout(function () { handleSettingsElementFromStore() }, 500)
})

function handleSettings(cb) {
    settings.onPage = onPage()
    settings.inFrame = function() {
        return top !== window
    }

    var loadApplication = 
        getOrSetSetting("displayname", "", function (setting) {
            settings.displayname = setting
            getOrSetSetting("currentcoin", { name: "ribbit", short: "rbr" }, function (setting) {
                settings.currentcoin = setting
                return appendAllSettings(cb)
            })
        })
    
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
    if (top.verbose) options.log = true
    iFrameResize(options)
}

/* Functions */
var preInit = function(cb) {

    bitcore = require('bitcore')
    ECIES = require('bitcore-ecies')
    explorers = require('bitcore-explorers-multi')
    
    var current = settings.currentcoin
    if (current != null) {
        bitcore.Networks.AvailableNetworks.set(current.name)
        insight = bitcore.Networks.AvailableNetworks.currentNetwork().insight
        switchCoinImage(current.short, current.name)
    } else {
        insight = new explorers.Insight("ribbit")
        bitcore.Networks.AvailableNetworks.set("ribbit")
    }
    transaction = new bitcore.Transaction()
    viewQrcode = new QRCode("qrcode")

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
        //foundIdentity = []
        var setLocalIdentity = function(id) {
            newtables.privkey.allRecordsArray(function (rows) {
                $.each(rows, function () {
                    var record = $(this)[0]
                    if (record.isIdentity) {
                        foundIdentity.push(record.key)
                        return top.meshnet.checkInit()
                    }
                })
            })
        }
        newtables.privkey.keys(function(keys) {
             if (keys.error) {
                 newtables.privkey.newIdentity("Me",function(out) {
                    return setLocalIdentity()
                 })
             } else {
                return setLocalIdentity()
             }
        })
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
    showContent()
    switch(pageData.title) {
        case "Wallet":
            return renderWalletTemplate({})
        case "Profile":
            return renderProfileTemplate({})
        case "Key Management":
            return renderKeysTemplate({})
        case "Import / Export":
            return renderImportTemplate({})
    }
    if (pageData.page === "video-chat.html" && getQueryStringParam("call") !== undefined) {
        pageData.page = pageData.page + "?call=" + getQueryStringParam("call")
    }
    if ($("iframe").length > 0) {
        $("iframe").attr("src", pageData.page)
        $(".page-header h1").text(pageData.title)
        $(".frame-tab").text(pageData.title)
        $(".frame-tab").tab("show")
    }
    setTimeout(function (){ handleSettingsElementFromStore() }, 500)
}

function setSetting(value,target,type,cb) {
    Vault.addSetting(target + type, value, function () { 
        handleSettings(function () {
            return cb()
        })
    })
}

function adjustDesign() {
    //$("#wrap, .menu-bg").css("margin-bottom", Number("-" + $("footer").height()))
    //$(".navmenu").css("max-height", $(window).height() - $("footer").height())
    //$(".canvas .container").css("min-height", $(window).height() - ($("footer").height() + 160 + $(".balance-container").height() ))
    $(".togglebutton input").css("margin", "5px")
    //$("iframe").height($(".canvas .container").height() - ($("footer").height() + $(".balance-container").height()))
}

function handleSettingsElementFromStore() {
    matchPageSettingsToDatastore($(this))
}

function handleToggleSettingAction(context) {
    persistSettingToggleToDatastore(context)
}

function handleProfileImageUpload(context) {
    var fileInput = context.get(0)
    var fileDisplayArea = $("div[for='profileImage']")
    var file = fileInput.files[0];
    var imageType = /image.*/;
    
    if (file.type.match(imageType)) {
        var reader = new FileReader();
        
        reader.onload = function (e) {
            newtables.settings.insert("profileImage", { location: "base64", data: reader.result }, function (doc) {
                fileDisplayArea.css('background-image', 'url(' + reader.result + ')')
                console.log(doc)
                top.meshnet.publicUpdateIdentity()
                //top.matchPageSettingsToDatastore()
            })
        }
        
        reader.readAsDataURL(file);
    } else {
        top.popMsg("File not supported!")
    }
}

function getHeight() {
    return $(window).height() - $('h1').outerHeight(true);
}

/************* DATATABLE STUFF ***********
 * 
 *              Much is boilerplate
 * 
 *****************************************/
function initTables(){
    var $table = $('#table'),
        $remove = $('#remove'),
        selections = [];
    $(function () {
        $table.bootstrapTable({});
        $table.on('check.bs.table uncheck.bs.table ' +
            'check-all.bs.table uncheck-all.bs.table', function () {
            $remove.prop('disabled', !$table.bootstrapTable('getSelections').length);
            // save your data, here just save the current page
            selections = getIdSelections();
                // push or splice the selections if you want to save all data selections
        });
        $table.on('all.bs.table', function (e, name, args) {
            //This is where I can save the changes
            if (name.indexOf('editable-save') === 0) {
                var interestingRecord = args[1]._id
                var fieldEdited = args[0]
                Vault.getRecordFilteredOfType(Vault.tables.address, "_id", interestingRecord, function (data) {
                    data[fieldEdited] = args[1][fieldEdited]
                    initAllTheThings()
                    return Vault.tables.address.put(data)
                })
            }
            if (verbose) console.log(name, args);
        });
        $remove.click(function () {
            var ids = getIdSelections();
            $table.bootstrapTable('remove', {
                field: 'id',
                values: ids
            });
            $remove.prop('disabled', true);
        });
        $(window).resize(function () {
            $table.bootstrapTable('resetView', {
                height: getHeight()
            });
        });
    });
}

function getIdSelections() {
    return $.map($table.bootstrapTable('getSelections'), function (row) {
        return row.id
    });
}
function responseHandler(res) {
    $.each(res.rows, function (i, row) {
        row.state = $.inArray(row.id, selections) !== -1;
    });
    return res;
}
function operateFormatter(value, row, index) {
    return [
        '<a class="like" href="javascript:void(0)" title="Like">',
        '<i class="glyphicon glyphicon-heart"></i>',
        '</a>  ',
        '<a class="remove" href="javascript:void(0)" title="Remove">',
        '<i class="glyphicon glyphicon-remove"></i>',
        '</a>'
    ].join('');
}
window.operateEvents = {
    'click .like': function (e, value, row, index) {
        alert('You click like action, row: ' + JSON.stringify(row));
    },
    'click .remove': function (e, value, row, index) {
        $table.bootstrapTable('remove', {
            field: 'id',
            values: [row.id]
        });
    }
};
function totalTextFormatter(data) {
    return 'Total';
}
function totalNameFormatter(data) {
    return data.length;
}
function totalPriceFormatter(data) {
    var total = 0;
    $.each(data, function (i, row) {
        total += +(row.price.substring(1));
    });
    return '$' + total;
}

function linkPrivKeyFormatter(value, row, index) {
    return [
        '<a href="javascript:void(0)" title="Like">',
        '<i class="glyphicon glyphicon-eye-open"></i>',
        '</a>  '
    ].join('');
}
function linkPubKeyFormatter(value, row, index) {
    return [
        '<a href="javascript:void(0)" title="Like">',
        '<i class="glyphicon glyphicon-eye-open"></i>',
        '</a>  '
    ].join('');
}

function matchPageSettingsToDatastore() {
    /* Toggles */
    $.each($(".togglebutton input"), function () {
        var togglefor = $(this).attr("for")
        var target = $(this).attr("toggletype")
        var toggle = $(this)
        newtables.settings.getOrDefault(togglefor + target, false, function(err, doc) {
            toggle.prop("checked", doc.value)
            if (target === "advanced" && doc.value) {
                $(".advanced").show()
            }
        })
    })
    /* Background Images */
    $.each($("div[for]"), function () {
        var target = $(this).attr("for")
        var img = $(this)
        newtables.settings.get(target, function (err, out) {
            if (err) { return }
            var url = out.value
            if (url.location === "stock") {
                //img.attr("src", "./images/avatars/characters_" + url.id + ".png")
                img.css('background-image', 'url(./images/avatars/characters_' + url.id + '.png)')
            } else if (url.location === "base64") {
                //img.attr("src", url.data)
                img.css('background-image', 'url(' + url.data + ')')
            }
        })
    })
    /* Images */
    $.each($("img[for]"), function () {
        var target = $(this).attr("for")
        var img = $(this)
        newtables.settings.get(target, function (err, out) {
            if (err) { return }
            var url = out.value
            if (url.location === "stock") {
                //img.attr("src", "./images/avatars/characters_" + url.id + ".png")
                img.css('background-image', 'url(./images/avatars/characters_' + url.id + '.png)')
                img.attr("src", "")
            } else if (url.location === "base64") {
                //img.attr("src", url.data)
                img.attr("src", "")
                img.css('background-image', 'url(' + url.data + ')')
            }
        })
    })
    /* Text Inputs */
    $.each($("input[for][type='text']"), function() {
        var target = $(this).attr("for")
        var input = $(this)
        handleProfileSaveButton()
        newtables.settings.get(target, function (err, out) {
            if (err) { return }
            input.val(out.value)
        })
    })
    /* Text Area Inputs */
    $.each($("textarea[for]"), function () {
        var target = $(this).attr("for")
        var input = $(this)
        newtables.settings.get(target, function (err, out) {
            if (err) { return }
            input.val(out.value)
        })
    })
    /* Links */
    $.each($("a[for]"), function () {
        var target = $(this).attr("for")
        var input = $(this).find("span")
        newtables.settings.get(target, function (err, out) {
            if (err) { return }
            if (out.value !== undefined && out.value !== "") {
                input.text(out.value)
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

var initApplication = function() {

    initAllTheThings()
    console.log("Init Application")
    $.material.init();
    if (!settings.inFrame()) {
        var options = { selectorAttribute: "data-target" };
        $('#tabs').stickyTabs(options);
        top.renderChatList()
        top.loadBalance($(".balance-container"))
    }
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
        
        /* Profile Save Button */
        $(document).on('click.customBindings', '.profileSaveButton', function () {
            top.popMsg("Saved profile settings")
        })

        /* Toggle Profile Pic */
        $(document).on('click.customBindings', 'div[for="profileImage"]', function() {
            top.changeProfileImageStock($(this))
        })

        /* Upload Image */
        $(document).on('change.customBindings', "#profileImageUpload", function () {
            handleProfileImageUpload($(this))
        })

       
        /* Change Coin Menu */
        $(document).on('click.customBindings', '.coinPicker', function () {
            toggleCoinSelection()
        })
        
        /* Menu Chat */
        $(document).on('click.customBindings', '.small-chat-link', function () {
            showChat()
        })

        /* Change Coin */
        $(document).on('click.customBindings', '.coinSelect', function() {
            hideCoinSelection()
            var newCoin = $(this).attr("data")
            var newCoinName = $(this).attr("name")
            switchCoinImage(newCoin, newCoinName)
            bitcore.Networks.AvailableNetworks.set($(".coinPicker").attr("name"))
            insight = bitcore.Networks.AvailableNetworks.currentNetwork().insight
            newtables.settings.insert("currentcoin", { name: newCoinName, short: newCoin }, function(doc) {
                //windowProxy.post({ command: "contextSwitch", payload: insight })
                var updateCoinTo = insight.network.name
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
            
                popMsg("Wallet context changed to " + $(".coinPicker").attr("name").toUpperCase())
                loadBalance($(".balance-container"))
            })
        })
        
        /* Any hash link that should load framed content */
        $(document).on('click.customBindings', '.navlink', function () {
            if ($(this).attr("href") === undefined) { return }
            setTimeout(function() { top.loadPageByHash() }, 500)
        })
    
    $(document).on('click.customBindings', '.importKey', function (data) {
        top.newtables.privkey.importHD($("#inputpk").val(), $("#labelInput").val() , function (a, b) {
            console.log(a, b)
            if (a) {
                top.popMsg(JSON.stringify(a))
            } else {
                top.popMsg("Sucessfully imported key")
            }
        })
    })

        /* Hometabs switch */
        $(document).on('click.customBindings', '.hometabs a', function(e) {
            e.preventDefault()
            $(this).tab("show")
        })

        /* Add a friend */
        $(document).on('click.customBindings', '.addFriend', function (e) {
            var address = $(this).attr("data")
            $(this).removeClass("fa-plus-circle").addClass("fa-minus-circle")
            makeFriend(address, function () {
                console.log("added: " + address)
            })
        })

        /* Remove a friend */
        $(document).on('click.customBindings', '.removeFriend', function (e) {
            var address = $(this).attr("data")
            $(this).removeClass("fa-minus-circle").addClass("fa-plus-circle")
            loseFriend(address, function () {
                console.log("removed: " + address)
            })
        })

        /* Save new address with name */
        $(document).on('change.customBindings', '#accountName', function () {
            if ($("#accountName").val() !== "") {
                newtables.privkey.newHD($("#accountName").val(), function (record) {
                /* windowProxy.post({ command: "loadAddressPicker", payload: record })*/
                   loadAddressPicker()
                    $("#accountName").val("")
                })
            
            } $("#nameAccountModal").modal("hide")
        })

        /* On Change Output Amount */
        //TODO: Integrate into new wallet page
        $(document).on('change.customBindings', '.form-control.amount', function () {
            handleAmountInput()
        })

        /* Send chat into the world */
        $(document).on('change.customBindings', "#chatInput", function () {
            var target = $(this)
            var msg = target.val()
            $(this).val("")
            if (!settings.inFrame()) {
                var chat = new Chat({ "payload": msg })
                setTimeout(function () { chat.broadcast() }, 500)
            }
        })

        /* Address Picker Actions */
        $(document).on('click.customBindings', '.wallet-address-picker .dropdown-menu .wallet-action', function (data) {
            if (this.text === "Generate new address") {
                top.$("#nameAccountModal").modal("show")
                return false
            }
        })

        /* show QR modal */
        $(document).on('click.customBindings', '.qrButton', function (data) {
            top.$("#modalQrcode").modal("show")
            return false
        })
        
        /* show QR Scanner Modal */
        $(document).on('click.customBindings', '.qrScanButton', function (data) {
            top.showQrScannerModal()
            return false
        })
        
        /* bind to send button */
        $(document).on('click.customBindings', '.send-now', function (data) {
            top.$("#modalWalletConfirm").modal("show")
            $(".wallet-address-picker").removeClass("open")
            return false
        })
        
        /* bind picker to the whole button */
        $(document).on('click.customBindings', '.wallet-address-picker', function (data) {
            $(".wallet-address-picker").addClass("open")
            $(".wallet-address-picker .address-view .ripple-wrapper").remove()
            return false
        })

        /* Add / Remove UTXO to/from transaction */
        $(document).on('click.customBindings', '.button-container a', function () {
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
        $(document).on('click.customBindings', ".qrcodeBtn", function () {
        var address = $('.wallet-address-picker .address-view').text()
        if (settings.inFrame()) {
            top.generateQr(address)
            top.showQrModal()
        } else {
            generateQr(address)
            showQrModal()
        }
    })
    
    /*New address picker event binding*/
    $(document).on('click.customBindings', '.wallet-address-picker .dropdown-menu .address-item', function (data) {
        if ($(".address-view").html() !== "Choose Account to send from") {
            var previouslySelected = $(".address-view").html()
            $(previouslySelected).insertBefore($(this))
        }
        $(".address-view").html($(this))
        $(".qrButton").removeAttr("disabled")
        var address = $(data.currentTarget).attr("data")
        $(".wallet-address-picker").removeClass("open")
        top.generateQr(address)
        return false
    })
    
    /* Monitor To Address */
    $(document).on('keyup.customBindings', '.toAddress', function () {
        var addressString = $(this).val()
        try {
            var address = top.bitcore.Address(addressString)
            if (address.network.name === top.bitcore.Networks.AvailableNetworks.currentNetwork().name) {
                $(".send-now").removeClass("btn-default").addClass("btn-success")
            }
        } catch (e) {
            $(".send-now").addClass("btn-default").removeClass("btn-success")
            //console.log(e)
        }
    })
    
    /* OLD Address Picker Magic */
    /*$(document).on('click.customBindings', '.wallet-address-picker .dropdown-menu .address-item', function (data) {
            resetTransaction()
            resetToAmountFields()
            /* Copy link text to root element #1#
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
        })*/

        /* Broadcast TX */
        $(document).on('click.customBindings', '.transaction-broadcast', function (data) {
        try {
            if (!transaction.isFullySigned()) {
                console.log("forgot to sign")
                $(".transaction-add-output").click()
            }
            insight.broadcast(transaction, function (err, txid) {
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
    
    /* Add output to transaction and sign */
    $(document).on('click.customBindings', '.transaction-add-output', function () {
        var fromAddress = $(".address-view").text()
        var toAddress = $("#output-address").val()
        var amount = $("#output-amount").val() * 100000000
        var key
        try {
            transaction.to(toAddress, amount)
            transaction.change(fromAddress)
            getKeyFromAddress(fromAddress, function (keydata) {
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
    $(document).on('click.customBindings', '.transaction-reset', function () {
        resetTransaction()
        var address = $(".address-view").text()
        getBalance(address)
    })

    /* Toggle */
    $(document).on('click.customBindings', '.togglebutton input', function () {
        handleToggleSettingAction($(this))
        top.meshnet.publicUpdateIdentity()
    })
    
    /* UI hotness */
    $(document).on('click.bs.radio.customBindings', '.btn-radio > .btn', function (e) {
        $(this).siblings().removeClass('active');
        $(this).addClass('active');
        handleIdentityViewType($(this))
    })
    
    /* On change (setting fields updated) */
    $(document).on('change.customBindings', "input[type='text'][for]", function () {
        toggleOn($(this))
        top.meshnet.publicUpdateIdentity()
        top.matchPageSettingsToDatastore()
    })
    /* text area setting binding */
    $(document).on('change.customBindings', "textarea[for]", function () {
        toggleOn($(this))
        top.meshnet.publicUpdateIdentity()
        top.matchPageSettingsToDatastore()
    })
    //TODO: Combine this and the method above
    $(document).on('keyup.customBindings', "input[type='text'][for]", function () {
        var target = $(this)
        handleProfileSaveButton()
        newtables.settings.insert(target.attr("for"), target.val(), function (doc) {
            //top.matchPageSettingsToDatastore()
        })
    })
    $(document).on('keyup.customBindings', "textarea[for]", function () {
        var target = $(this)
        handleProfileSaveButton()
        newtables.settings.insert(target.attr("for"), target.val(), function (doc) {
            //top.matchPageSettingsToDatastore()
        })
    })
}

function loadAddressPicker() {
    var label = "Basic"
    var totalBalance = 0
    var targetNetwork = top.bitcore.Networks.AvailableNetworks.currentNetwork().name
    var shortCode = top.bitcore.Networks.AvailableNetworks.currentNetwork().insight.network.alias
    $(".wallet-address-picker .dropdown-menu li.addressItem").remove()
    $(".address-view").html('Choose Account to send from')
    
    top.newtables.privkey.allRecordsArray(function (records) {
        $.each(records, function () {
            if ($(this)[0].isIdentity) { return }
            var hd = new top.bitcore.HDPrivateKey($(this)[0].key.xprivkey)
            var address = hd.privateKey.toAddress()
            var addressNetwork = address.network.name
            if ($(this)[0].label !== undefined) {
                label = $(this)[0].label
            }
            if (addressNetwork === "livenet") {
                addressNetwork = "bitcoin"
            }
            if (addressNetwork === targetNetwork) {
                $('<li class="addressItem"><div data="' + address + '" class="accountInPicker address-item"><div class="accountLabel">' + label + ' Account </div><span class="accountInPickerBalance"></span><div class="itemAddress">' + address + '</div></div>').insertBefore(".wallet-address-picker .dropdown-menu .divider");
                top.insight.getBalance(address, function (err, balance) {
                    var target = $("div[data='" + address + "'] .accountInPickerBalance")
                    target.html(balance * 0.00000001 + " " + shortCode)
                    if (balance > 0) {
                        balance = balance * 0.00000001
                        target.addClass("positiveBalance")
                    }

                })
            }
        })
    })
}

/* OLD Load Address Picker */
/*function loadAddressPicker() {
/*    getAllTablesAsDataTable(function (data) {
        var rows = data.address.rows
        var targetNetwork = settings.currentcoin.name
        //remove list items
        $(".wallet-address-picker .dropdown-menu li").remove()
        $(".wallet-address-picker .dropdown-menu").append("<li class=\"divider\"></li>")
        $("<li><a class=\"wallet-action\">Generate new address</a></li>").insertAfter(".wallet-address-picker .dropdown-menu .divider")
        $.each(rows, function (row) {
            var r = rows[row]
            var label
            var address = bitcore.Address(r.addressData)
            var addressNetwork = address.network.name
            if (addressNetwork === "livenet") {
                addressNetwork = "bitcoin"
            }

            if (addressNetwork === targetNetwork) {
                if (r.label !== "")
                    label = r.label
                if (r.format !== "Identity") {
                    $("<li><a class=\"address-item\" data=\"" + r.addressData + "\">" + (label || r.addressData) + "</a></li>").insertBefore(".wallet-address-picker .dropdown-menu .divider");
                }
            }
        })
    })#1#
    var targetNetwork = settings.currentcoin.name
    $(".wallet-address-picker .dropdown-menu li").remove()
    $(".wallet-address-picker .dropdown-menu").append("<li class=\"divider\"></li>")
    $("<li><a class=\"wallet-action\">Generate new address</a></li>").insertAfter(".wallet-address-picker .dropdown-menu .divider")
    var label
    newtables.privkey.allRecordsArray(function (records) {
        $.each(records, function () {
            if (!$(this)[0].isIdentity) {
                var hd = new bitcore.HDPrivateKey($(this)[0].key.xprivkey)
                var address = hd.privateKey.toAddress()
                var addressNetwork = address.network.name
                if (addressNetwork === "livenet") {
                    addressNetwork = "bitcoin"
                }
                if (addressNetwork === targetNetwork) {
                    $("<li><a class=\"address-item\" data=\"" + address + "\">" + (label || address) + "</a></li>").insertBefore(".wallet-address-picker .dropdown-menu .divider");
                }
            }
        })
    })
}*/

function handleProfileSaveButton() {
    var empty = []
    var state
    $.each($("input:text"), function () {
        if ($(this).val() === "") { empty.push($(this)) }
    })
    
    if (empty.length === $("input:text").length) { state = true }
    else {state = false}

    if (state) {
        $(".profileSaveButton span").text("Identity Information Required") 
        $(".profileSaveButton").removeClass("btn-primary").addClass("btn-warning").prop("disabled",true)
        $(".profileSaveButton i").removeClass("mdi-navigation-check").addClass("mdi-navigation-close")
        
    } else {
        $(".profileSaveButton span").text("Click to Save Profile")
        $(".profileSaveButton").addClass("btn-primary").removeClass("btn-warning").prop("disabled", false)
        $(".profileSaveButton i").addClass("mdi-navigation-check").removeClass("mdi-navigation-close")
        

    }
}

function toggleOn(elem) {

    var toggle 
    var preState
    if (elem.prop('tagName') === "DIV") { //Turn on
        prestate = false
        toggle = elem.parent().find("input[for='" + elem.attr("for") + "']")
    } else if (elem.val() === "") { //Turn off
        prestate = true
        toggle = $("input[for='" + elem.attr("for") + "']")
    } else { //Turn on
        prestate = false
        toggle = $("input[for='" + elem.attr("for") + "']")
    }
    toggle.prop("checked", prestate)
    toggle.click()
}

function showQrModal() {
    $("#modalQrcode").modal("show")
}

function showQrScannerModal() {
    QRScanload(function (scannedData) {
        $("#newModalQrcodeScanner").modal("hide")
        windowProxy.post({ command: "scannedQR", payload: scannedData })
    })
    $("#newModalQrcodeScanner").modal("show")
}

$('#newModalQrcodeScanner').on('hidden', function () {
    camstream.close()
})

$(document).on('hide.bs.modal', '#newModalQrcodeScanner', function () {
    camstream.close()
});

function loadBalance(balanceElement) {
    var totalBalance = 0
    var targetNetwork = top.bitcore.Networks.AvailableNetworks.currentNetwork().name
    var shortCode = top.bitcore.Networks.AvailableNetworks.currentNetwork().insight.network.alias
    if (targetNetwork === "bitcoin") { shortCode = "BTC" }
    balanceElement.text(totalBalance + " " + shortCode)
    top.newtables.privkey.allRecordsArray(function (records) {
        $.each(records, function () {
            var hd = new top.bitcore.HDPrivateKey($(this)[0].key.xprivkey)
            var address = hd.privateKey.toAddress()
            var addressNetwork = address.network.name
            if ($(this)[0].label !== undefined) {
                label = $(this)[0].label
            }
            if (addressNetwork === "livenet") {
                addressNetwork = "bitcoin"
            }
            if (addressNetwork === targetNetwork) {
                top.insight.getBalance(address, function (err, balance) {
                    if (balance > 0) {
                        balance = balance * 0.00000001
                        totalBalance = totalBalance + balance
                        balanceElement.text(totalBalance + " " + shortCode)
                    }
                    balanceElement.text(totalBalance + " " + shortCode)
                })
            }
        })
    })
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

function toggleCoinSelection() {
    if ($(".coin-menu").is(":visible")) {
        $(".coin-menu").hide()
    } else { $(".coin-menu").show() }
    
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
function changeProfileImageStock(context) {
    
    var rnd = randomIntFromInterval(1, 94)
    context.css("background-image", "url(./images/avatars/characters_" + rnd + ".png)")
    top.$(".profile-item img").attr("src","")
    top.$(".profile-item img").css("background-image", "url(./images/avatars/characters_" + rnd + ".png)")
    newtables.settings.insert("profileImage", {location: "stock", id: rnd}, function(doc) {
        toggleOn(context)
        console.log(doc)
        top.meshnet.publicUpdateIdentity()
    })
}
/* CHAT  */
function addGroupChatMsg(payload) {
    var msg = payload.msg
    var address = payload.address
    newtables.peers.get(payload.address, function (err, data) {
        var peer = new Peer(data)
        data = photoObjectToUrl(data.value)
        data.msg = escapeHtml(msg)
        peer.isMe(function(me) {
            if (data.address === bitcore.HDPrivateKey(foundIdentity[0].xprivkey).privateKey.toAddress().toString()) {
                data.class = "self"
            } else {
                data.class = "other"
            }
                renderChatRow(data)
        })
    })
}

function showChat() {
    $(".chatTab").tab("show")
}

function showContent() {
    $(".frame-tab").tab("show")
}

/* HandleBars compile template */
function renderChatModule() {
    var source = $("#chatModule").html();
    var template = Handlebars.compile(source);
    var data = {}
    $("#messagewindow.msgs").html(template(data));
}
/* HandleBars compile template */
function renderPeerChatModule() {
    var source = $("#peerModule").html();
    var template = Handlebars.compile(source);
    var data = {}
    $("#messagewindow.users").html(template(data));
}
/* HandleBars compile template */
function renderPeerRow(data, target) {
    locatePeerRow(data.address, function (row) {
        var source = $("#peerRow").html();
        var template = Handlebars.compile(source);
        if (row !== null) {
            $(row).remove()
        }
        
        $(target).append(template(data));
    })
}
/* HandleBars compile template */
function renderChatRow(data) {
    var source = $("#chatRow").html();
    var template = Handlebars.compile(source);
    
    if (continuationOfLastChat(data)) {
        $(".discussion li .messages").last().append("<p>" + data.msg + "</p>")
    } else {
        $(".discussion").append(template(data));
    }
    scrollChat()
}

/* HandleBars compile Wallet template */
function renderWalletTemplate(data) {
    $.ajax({
        url : './templates/wallet.html',
        success : function (data) {
            var template = Handlebars.compile(data)
            animateOut(template, function() {
                loadAddressPicker()
            })
        },
        dataType: "text",
        async : false
    });
}

/* HandleBars compile wallet template */
function renderProfileTemplate(data) {
    getPublicIdentity(function (a) {
        var profile = a
        profile.photo = photoObjectToUrl(a.photo).photo
        
        $.ajax({
            url : './templates/profile.html',
            success : function (data) {
                var template = Handlebars.compile(data)
                animateOut(template(profile), function () {
                    handleSettingsElementFromStore()
                })
            },
            dataType: "text",
            async : false
        })
    })
}

/* HandleBars compile keys template */
function renderKeysTemplate(data) {
    $.ajax({
        url : './templates/keys.html',
        success : function (data) {
            var template = Handlebars.compile(data)
            animateOut(template(profile), function() {
                initTables()
            })
        },
        dataType: "text",
        async : false
    });
}

/* Handlebars compile import template */
function renderImportTemplate(data) {
    $.ajax({
        url : './templates/import.html',
        success : function (data) {
            var template = Handlebars.compile(data)
            animateOut(template(profile), function() {})
        },
        dataType: "text",
        async : false
    });
}

function animateOut(template, cb) {
    $("#frame").children().removeClass("fadeInUp").addClass("fadeOutUp")
    setTimeout(function() {
        $("#frame").html(template)
        cb()
    },500)
}

function locatePeerRow(address, cb) {
    var continueEach = true
    var peers = $("#messagewindow .peer")
    if (peers.length === 0) {
        return cb(null)
    }
    $.each(peers, function (i) {
        if (continueEach) {
            var found = $(this).find("[address='" + address + "']").get(0)
            if (found) {
                continueEach = false
                return cb($(this))
            }
            if (i === peers.length - 1) {
                return cb(null)
            }
        }
    })
}

function continuationOfLastChat(data) {
    return data.address === $(".discussion li").last().find("img[address]").attr("address")
}


function scrollChat() {
    $("#messagewindow.msgs").animate({ scrollTop: $("#messagewindow.msgs").prop("scrollHeight") - $("#messagewindow.msgs").height() }, 300);
}

function loseFriend(address, cb) {
    var peer = new Peer(address)
    peer.loseFriend(cb)
}

function makeFriend(address, cb) {
    var peer = new Peer(address)
    peer.makeFriend(cb)
}

function renderChatList() {
    newtables.peers.allRecords(function (rows) {
        $.each(rows, function () {
            /* Adjust Name */
            if (this.name === undefined && this.nickname === undefined) {
                this.name = "Anonymous"
            } else if (this.name === undefined && this.nickname !== undefined) {
                this.name = this.nickname
            }
            /* Adjust Image */
            if (this.photo === undefined) {
                this.photo = "./images/profile.png"
            } else if (this.photo.location === "base64") {
                this.photo = this.photo.data               
            } else if (this.photo.location === "stock") {
                this.photo = "./images/avatars/characters_"+this.photo.id+".png"
            }
            if (this.online) {
                renderPeerRow(this, $("#messagewindow .peerlist .peers"))
            }
        })
    })
        /*$(".chatlist").html("")
        var onlineCnt = 0
        var listActionIcon, listActionClass
        $.each(rows, function () {
            var data = $(this).get(0)
            var photo = data.photo
            var user, url
            if (data.name !== undefined) {
                user = data.name
            } else if (data.nickname !== undefined) {
                user = data.nickname
            } else {
                user = "Anonymous"
            }
            if (photo !== undefined && photo.location !== undefined && photo.location === "stock") {
                url = "./images/avatars/characters_" + photo.id + ".png"
            } else if (photo !== undefined && photo.location !== undefined && photo.location === "base64") {
                url = photo.data
            } else {
                url = "./images/profile.png"
            }
            var onlineclass = ""
            var onlinestyle = ""
            var onlineindicator = ""
            var isonline = ""
            var border = "border: 2px solid green;"
            var detailstyle = " position: relative;  left: 45px;  top: -15px;"
            var listAction
            if (data.isfriend) {
                listAction = "data='" + data.address + "'"
                listActionIcon = "fa-minus-circle"
                listActionClass = "removeFriend"
            } else {
                listAction = "data='" + data.address + "'"
                listActionIcon = "fa-plus-circle"
                listActionClass = "addFriend"
            }
            var communicate = '<i '+ listAction+' class="'+ listActionClass +' fa-double fa fa-lg '+ listActionIcon +'" style="float:right;"></i>'
            var shadow = "  box-shadow: 0 1px 6px 0 rgba(0,0,0,.12),0 1px 6px 0 rgba(0,0,0,.12); transition: box-shadow .28s cubic-bezier(.4,0,.2,1);"
            if (!data.online) {
                onlineclass = "btn-danger";
                onlinestyle = "opacity: 0.4;filter: alpha(opacity=40);";
                border = "border: 2px solid red;";
            } else {
                communicate += '<i class="fa fa-lg fa-weixin" style="float:right;"></i>'
                communicate += '<i class="fa fa-lg fa-video-camera" style="float:right;"></i>'
                onlineclass = "btn-success";
                onlineCnt = onlineCnt + 1
                $(".hometabs .badge").text(onlineCnt)
            }
            newtables.settings.get("hideoffline", function (err, doc) {
                if (doc.value && !data.online) {
                    isonline = "display: none; "
                }
                $(".chatlist").append('<li style="' + isonline + '"><div><div>' + onlineindicator + '<img address="' + escapeHtml(data.address) + '" class="circular" style="width:35px !important; height:35px !important; cursor: pointer; ' + onlinestyle + shadow + border + '" src="' + escapeHtml(url) + '"></div><div style="' + detailstyle + '">' + escapeHtml(user) + communicate + '</div></div></li>')
                $(".chatlist .row").css("height", "38px")

                /* update past chats #1#
                $.each($(".chatmsg"), function () {
                    var image = $(this).find($("img[address='"+ escapeHtml(data.address) +"']")).get(0)
                    var display = $(this).find($(".username")).get(0)
                    if (image !== undefined) {
                        $(image).attr("src", escapeHtml(url))
                        $(display).text(user)
                    }
                })
            })
            


            //onlineindicator = '<a href="javascript:void(0)" class="btn '+onlineclass+' btn-fab btn-raised" style="width:40px; height:40px; position: absolute;"></a>'
            
        })
    })*/
}
/* CHAT */

function photoObjectToUrl(data) {
    if (data.photo === undefined) {
        data.photo = "./images/profile.png"
    } else if (data.photo.location === "base64") {
        data.photo = data.photo.data
    } else if (data.photo.location === "stock") {
        data.photo = "./images/avatars/characters_" + data.photo.id + ".png"
    }
    return data
}

function escapeHtml(html) {
    var text = document.createTextNode(html);
    var div = document.createElement('div');
    div.appendChild(text);
    return div.innerHTML;
}

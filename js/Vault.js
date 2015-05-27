$(document).ready(function () {
    performImports("menu", function (html5Import) {
        $(".menuframe").iFrameResize({ log: false, enablePublicMethods: true, sizeWidth: true, sizeHeight: false, resizedCallback: resizeFromIframe })
        console.log("Need to fix up this iframe")
    })

    initAllTheThings()

})

function initAllTheThings() {
    loadAddressTable()

    loadAddressPicker()

    bindClicks()

    checkHash()

    getDisplayName($("#displayName"))
}

function loadAddressTable() {
    getAllTablesAsDataTable(function (data) {
        $('#table').bootstrapTable('load', data.address)
        console.log(data)
    })
}

function loadAddressPicker() {
    getAllTablesAsDataTable(function (data) {
        var rows = data.address.rows
        //remove list items
        $(".wallet-address-picker .dropdown-menu li").remove()
        $(".wallet-address-picker .dropdown-menu").append("<li class=\"divider\"></li>")
        $("<li><a>Generate new address</a></li>").insertAfter(".wallet-address-picker .dropdown-menu .divider")
        $.each(rows, function (row) {
            var r = rows[row]
            var label
            console.log(r.label == "")
            if (r.label != "")
                label = r.label + " | "
            if (r.format != "Identity") {
                $("<li><a class=\"address-item\">" + (label || "") + r.addressData + "</a></li>").insertBefore(".wallet-address-picker .dropdown-menu .divider");
                console.log(row)
            }
        })
    })
}

function resizeFromIframe(data) {
    $(".content-col").animate({
        'padding-left': Number(data.width) - 10
    }, 400);
    $(".identity-nav").animate({
        'padding-left': Number(data.width) + 10
    }, 200);
    $(".navbar-header img").animate({
        'padding-left': Number(data.width) + 20
    }, 200);
}

var imports = {
    pages: [
        { name: "menu", file: "menu.html", selector: ".menu-col" }
    ]
}

function performImports(which, cb) {
    if (which === undefined) { which == "all" }
    var items = imports.pages
    var count = items.length
    var html5Import = supportsImports()
    if (which == "all") {
        $.each(items, function (item) {
            $('<iframe seamless width="40px" scrolling="no" frameborder="0" src="' + items[item].file + '" class="' + items[item].name + 'frame"></iframe>').appendTo(items[item].selector);
            $("." + items[item].name + "frame").height($("#wrap").height())
            if (!--count) cb(html5Import);
        })
    }
    else {
        $.each(items, function (item) {
            if (items[item].name == which) {
                $('<iframe seamless width="40px" scrolling="no" frameborder="0" src="' + items[item].file + '" class="' + items[item].name + 'frame"></iframe>').appendTo(items[item].selector);
                $("." + items[item].name + "frame").height($("#wrap").height())
                cb(html5Import)
            }
        })
    }
}

function supportsImports() {
    return 'import' in document.createElement('link');
}
/* DATATABLE STUFF */
var $table = $('#table'),
    $remove = $('#remove'),
    selections = [];
$(function () {
    $table.bootstrapTable({
        height: getHeight()
    });
    $table.on('check.bs.table uncheck.bs.table ' +
        'check-all.bs.table uncheck-all.bs.table', function () {
            $remove.prop('disabled', !$table.bootstrapTable('getSelections').length);
            // save your data, here just save the current page
            selections = getIdSelections();
            // push or splice the selections if you want to save all data selections
        });
    $table.on('all.bs.table', function (e, name, args) {
        //This is where I can save the changes
        if (name.indexOf('editable-save') == 0) {
            var interestingRecord = args[1]._id
            var fieldEdited = args[0]
            Vault.getRecordFilteredOfType(Vault.tables.address, "_id", interestingRecord, function (data) {
                data[fieldEdited] = args[1][fieldEdited]
                initAllTheThings()
                return Vault.tables.address.put(data)
            })
        }
        console.log(name, args);
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
function getHeight() {
    return $(window).height() - $('h1').outerHeight(true);
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
    
/* Click Binding */
function bindClicks() {
    /* Unbind */
    $(document).unbind(".customBindings")
    $("a[href='#lobby']").bind("click.customBindings", function () {
        joinLobby()
    })
    $(document).on('click.customBindings', '#newKeysBtn', function () {
        Vault.page.saveAddress(function (out) { console.log("Added address: "); console.log(out) })
        initAllTheThings()
    })
    $(document).on('click.bs.radio.customBindings', '.btn-radio > .btn', function (e) {
        $(this).siblings().removeClass('active');
        $(this).addClass('active');
        handleIdentityViewType($(this))
    });
    $(document).on('click.customBindings', '.displayNameSave', function () {
        Vault.addSetting("DisplayName", $("#displayName").val(), function (result) {
            initAllTheThings()
            console.log(result)
        })
    })
    /* Add / Remove UTXO to/from transaction */
    $(document).on('click.customBindings','.button-container a',function(){
        if ($(this).hasClass("hit")) {
            $(this).removeClass("hit")
            transaction.removeInput(Number(JSON.parse(JSON.parse($(this).data("index")))))
        } else {
            $(this).addClass("hit")
            transaction.from(JSON.parse(JSON.parse($(this).data("utxo"))))            
        }
        $(".transaction-hash").val(transaction.toString())
        if (transaction.toString() == "01000000000000000000"){        
            $(".transaction-hash-form").addClass("collapse")
        }
        else {
            $(".transaction-hash-form").removeClass("collapse")
        }
    })
    
    /* Add output to transaction */
    $(document).on('click.customBindings','.transaction-add-output',function(){
        var fromAddress = $(".address-view").text()
        var toAddress = $("#output-address").val()
        var amount = $("#output-amount").val()*100000000
        var key
        transaction.to(toAddress,amount)
        transaction.change(fromAddress)
        getKeyFromAddress(fromAddress,function(keydata){
            key = new bitcore.PrivateKey(keydata)
            transaction.sign(key)
            insight.broadcast(transaction,function(err,txid){
                popMsg("Transaction Success: "+txid)
                $(".transaction-hash").val("")
            })
            $(".transaction-hash").val(transaction.toString())
        })
    })
    
    /* QR rewrite */
    $(document).on('click.customBindings',".qrcodeBtn", function(){
        var address = $('.wallet-address-picker .address-view').text()
		generateQr(address)
	});
    
    /* Address Picker Magic */
    $(document).on('click.customBindings', '.wallet-address-picker .dropdown-menu .address-item', function (data) {
        transaction = new bitcore.Transaction()
        $(".transaction-hash").val(transaction.toString())
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
}

function getKeyFromAddress(address,cb){
   Vault.getRecordFilteredOfType(tables.address,"addressData",address,function(data){
        console.log(data)
        Vault.getRecordFilteredOfType(tables.privkey,"_id",data.privkeyId,function(data){
            console.log(data.keydata)
            return cb(data.keydata)
        })
    })
}

function getBalance(address) {    
    var balanceSelector = ".wallet-address-picker-balance"
    $(balanceSelector).removeClass("label-success")
    $(balanceSelector).removeClass("label-warning")
    insight.getBalance(address, function (err, balance) {
        if (err) {
            // Handle errors...
        } else {
            if (Number(balance) == 0) {
                $(balanceSelector).addClass("label-warning")
                $(".button-container").html("")
                $(balanceSelector).text("Balance: 0")                
                $(".menu-container").addClass("collapse")
            } else {
                $(balanceSelector).addClass("label-success")
                $(balanceSelector).text("Balance: "+balance*0.00000001+" "+insight.network.alias.toUpperCase())
                $(".menu-container").removeClass("collapse")
                getUtxos(address)
                
            }
        }
    })
}

function getUtxos(address){
    var utxoSelector = ".wallet-utxo-picker"
    insight.getUnspentUtxos(address, function(err, utxos) {
        $(".button-container").html("")
      if (err) {
        console.log(err)
      } else {
          console.log("UTXOs")          
          $.each(utxos,function(index,value){
              $(".button-container").append("<a data-index='"+index+"' data-utxo='"+JSON.stringify(value)+"' href=\"#\">"+value.satoshis*0.00000001+" RBR</a>")
              console.log(value)
          })
          console.log(utxos)
      }
    });
}

function checkHash() {
    switch (location.hash) {
        case "#lobby":
            joinLobby()
            break;
    }
}

function generateQr(data){
    $("#qrcode").html("");
    $(".modal-title").text(data)
    qrcode = new QRCode("qrcode");
	qrcode.makeCode("bitcoin:"+data);
    
}

function handleIdentityViewType(element) {
    switch (element.text()) {
        case "Official Name":
            displayOfficialNames()
            break;
        case "My Label":
            displayMyLabels()
            break;
        default:
            displayAddresses()
            break
    }
}

function displayOfficialNames() {
    var elements = $(".panel .list-group-item")
    $.each(elements, function (index, value) {
        if ($(value).attr("data-name") != "")
            $(value).find("strong").text($(value).attr("data-name"))
        else {
            $(value).find("strong").text($(value).attr("data-address") + " (No Display Name Specified)")
        }
    })
}
function displayMyLabels() { }
function displayAddresses() {
    var elements = $(".panel .list-group-item")
    $.each(elements, function (index, value) {
        $(value).find("strong").text($(value).attr("data-address"))
    })
}
    
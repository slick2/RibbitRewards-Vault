$(document).ready(function () {
	performImports("menu",function(html5Import){
		$(".menuframe").iFrameResize({log:false, enablePublicMethods:true, sizeWidth:true, sizeHeight:false, resizedCallback: resizeFromIframe})
		console.log("Need to fix up this iframe")
	})
    
   loadAddressTable()
    
   bindClicks()
    
   checkHash()
   
   getDisplayName($("#displayName"))
})

function loadAddressTable(){
    getAllTablesAsDataTable(function(data){
    	$('#table').bootstrapTable('load',data.address)
    	console.log(data)
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
	pages : [
		{name: "menu", file: "menu.html", selector: ".menu-col"}
	]
}

function performImports(which, cb) {
	if (which === undefined ) {which == "all" }
	var items = imports.pages
	var count = items.length
	var html5Import = supportsImports()
	if (which == "all") {
		$.each(items, function(item){
			$('<iframe seamless width="40px" scrolling="no" frameborder="0" src="'+items[item].file+'" class="'+items[item].name+'frame"></iframe>').appendTo(items[item].selector);
			$("."+items[item].name+"frame").height($("#wrap").height())
			if (!--count) cb(html5Import);
		})
	}
	else {
		$.each(items, function(item){
			if (items[item].name == which) {
				$('<iframe seamless width="40px" scrolling="no" frameborder="0" src="'+items[item].file+'" class="'+items[item].name+'frame"></iframe>').appendTo(items[item].selector);
				$("."+items[item].name+"frame").height($("#wrap").height())
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
            	Vault.getRecordFilteredOfType(Vault.tables.address, "_id", interestingRecord, function(data) {
            		data[fieldEdited] = args[1][fieldEdited]
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
    function bindClicks(){
        $("a[href='#lobby']").bind("click", function(){
            joinLobby()
        })
        $(document).on('click', '#newKeysBtn', function() {
    		Vault.page.saveAddress(function(out){console.log("Added address: ");console.log(out)})
            loadAddressTable()
    	})
        $(document).on('click.bs.radio', '.btn-radio > .btn', function(e) {
          $(this).siblings().removeClass('active');
          $(this).addClass('active');
          handleIdentityViewType($(this))
        });
        $(document).on('click','.displayNameSave',function(){
            Vault.addSetting("DisplayName",$("#displayName").val(),function(result){
                console.log(result)
            })
        })
    }
    
    function checkHash(){
        switch(location.hash){
            case "#lobby" :
                joinLobby()
            break;
        }
    }
    
    function handleIdentityViewType(element) {
        switch(element.text()) {
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
    
    function displayOfficialNames(){
        var elements = $(".panel .list-group-item")
        $.each(elements,function( index, value ) {
            if ($(value).attr("data-name") != "")            
                $(value).find("strong").text($(value).attr("data-name"))
            else 
                $(value).find("strong").text($(value).find("strong").text()+ " (No Display Name Specified)")
        })
    }
    function displayMyLabels(){}
    function displayAddresses(){
        var elements = $(".panel .list-group-item")
        $.each(elements,function( index, value ) {
            $(value).find("strong").text($(value).attr("data-address"))
        })
    }
    
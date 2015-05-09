$(document).ready(function () {
	performImports("menu",function(html5Import){
		/*if (!html5Import) {
	        $("#menu_multilevelpushmenu").height($(window).height())
			$('#menu').resize(function () {
				$(".content-col").animate({
					'padding-left': $('#menu').width()
				}, 400);
				$(".navbar-header").animate({
					'padding-left': $('#menu').width() +25
				}, 200);
				$("#menu nav").height($("#wrap").height())		
			})
		} else {*/
			$(".menuframe").iFrameResize({log:false, enablePublicMethods:true, sizeWidth:true, sizeHeight:false, resizedCallback: resizeFromIframe})
			console.log("Need to fix up this iframe")
		//}
	})
})

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
	//$(".menuframe").height($("#wrap").height())	
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
	//if (html5Import) {
		//add html5 import
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
	//}
	/*else {
		if (which == "all") {
			$.each(items, function(item){
				$(items[item].selector).load(items[item].file);
				if (!--count) cb(html5Import);
			})
		} else {
			$.each(items, function(item){
				if (items[item].name == which)
					$(items[item].selector).load(items[item].file, function(){
						cb(html5Import)
					});
			})
		}
	}*/
}

function supportsImports() {
  return 'import' in document.createElement('link');
}

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
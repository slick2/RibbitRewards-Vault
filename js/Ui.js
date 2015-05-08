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
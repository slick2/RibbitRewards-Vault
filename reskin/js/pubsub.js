var pubnub  
var uuid
function joinIdentity() {
    
    var address
  
    /*JOIN IDENTITY ADDRESS*/ 
    Identity.getIdentityObject(function(addy) {
        var identityAddress
        address = addy.address.addressData
        uuid = address
        pubnub = initPubNub(address)        
        pubnub.subscribe({
                channel: addy.address.addressData,
                message: function(message, env, channel) {
                popMsg(JSON.stringify(message))
            },
            connect: pub
        })
        //if not in database, store it        
        Vault.getRecordFilteredOfType(Vault.tables.channel, "name", address,function(data){
            if (data === undefined)
                Vault.addChannel(addy.pubkey._id, addy.privkey._id, addy.address._id, address, "identity", "10",  function(result){if (verbose) console.log(result)})
        })
    })
    
    function pub() {
        pubnub.publish({
            channel: address,
            message: "Joined Identity Channel: "+address,
            callback: function(m) {
                console.log("m: "+m)
            }
        })
    }    
}

function initPubNub(uuid){
    identityAddress = uuid
    var pubnub = PUBNUB.init({
            //publish_key: 'pub-c-bdf47ac2-b687-4918-a720-bb2d3a1b204f',
            //subscribe_key: 'sub-c-360460ce-eca5-11e4-aafa-0619f8945a4f',
            publish_key: 'demo',
            subscribe_key: 'demo',
            uuid: JSON.stringify({"uuid": uuid, "name": $("#displayName").val()})
        })
        return pubnub
}

function joinLobby() {
    var channel = 'RibbitRewards-lobby3'    
    var $output = $('#chat-output');
    $('#whoami').text(uuid);
    if (pubnub != null) {
        pubnub.subscribe({
          channel: channel,
          message: function(data) {
            
            var $line = $('<li class="list-group-item"  data-address="'+data.username+'" data-name="'+data.name+'" ><strong>' + data.username + ':</strong> </span>');
            var $message = $('<span class="text" />').text(data.text).html();
            
            $line.append($message);
            $output.append($line);
            
            $output.scrollTop($output[0].scrollHeight);
            //call display styler
            handleIdentityViewType($(".btn-radio > .btn.active"))
            
          }, 
          presence: function(data) {
        
            console.log(data);
            var identityObject = JSON.parse(data.uuid)
            if (verbose) console.log("Obj: ")
            //if (verbose) console.log(identityObject.name)
            // get notified when people join
            if(data.action == "join") {
        
              var $new_user = $('<li data-address="' + identityObject.uuid + '" data-name="'+identityObject.name+'" class="list-group-item"><strong>' + identityObject.uuid + '</strong></li>')
        
              $('#online-users').append($new_user);
              handleIdentityViewType($(".btn-radio > .btn.active"))
              popMsg(identityObject.uuid + "Joined the lobby")
            }
        
            // and when they leave
            if(data.action == "leave"  || data.action == "timeout") {
              $('#' + data.uuid).remove();
            }
        
          }
        })
        setupChatButton(channel)
    } else {
      setTimeout(function(){
        return joinLobby()
      },2000)
    }
}

function setupChatButton(channel){
  var $input = $('#chat-input');
  $('#chat').submit(function() {
    
    pubnub.publish({
      channel: channel,
      message: {
        text: $input.val(),
        username: uuid,
        name: $("#displayName").val()
      }
    });
    
    $input.val('');
    
    return false;
    
  });
}

function subscribeToBlockchain(){
    var eventToListenTo = 'tx'
    var room = 'inv'

    var socket = io("http://ribbitchain.info:80/");
    socket.on('connect', function() {
      // Join the room.
      socket.emit('subscribe', room);
    })
    socket.on(eventToListenTo, function(data) {
        var msg = "Blockchain registered new TX: " + data.txid
      console.log(msg)
      popMsg(msg)
    })
}

function initVideo(ident) {
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Generate Random Number if Needed
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				var urlargs         = urlparams();
				var my_number       = PUBNUB.$('my-number');
				var my_link         = PUBNUB.$('my-number-link');
				var number          = urlargs.number || ident || Math.floor(Math.random()*999+1);
				//var number = ident;
				
                my_number.number = number;
                
    my_number.innerHTML = '' + my_number.number;
    /*try {
        my_link.href = top.location.href.split('?')[0] + '?call=' + number;
    } catch (e) {*/
        my_link.href = "index.html?call=" + number + "#video-chat"
   /* }*/
    my_link.innerHTML   = my_link.href;
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Update Location if Not Set
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// if (!('number' in urlargs)) {
				//     urlargs.number = my_number.number;
				//     location.href = urlstring(urlargs);
				//     return;
				// }
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Get URL Params
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				function urlparams() {
				    var params = {};
				    if (location.href.indexOf('?') < 0) return params;
				
				    PUBNUB.each(
				        location.href.split('?')[1].split('&'),
				        function(data) { var d = data.split('='); params[d[0]] = d[1]; }
				    );
				
				    return params;
				}
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Construct URL Param String
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				function urlstring(params) {
				    return location.href.split('?')[0] + '?' + PUBNUB.map(
				        params, function( key, val) { return key + '=' + val }
				    ).join('&');
				}
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Calling & Answering Service
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				var video_out = PUBNUB.$('video-display');
				var img_out   = PUBNUB.$('video-thumbnail');
				var img_self  = PUBNUB.$('video-self');
				
				var phone     = window.phone = PHONE({
				    number        : my_number.number, // listen on this line
				    publish_key   : 'pub-c-561a7378-fa06-4c50-a331-5c0056d0163c',
				    subscribe_key : 'sub-c-17b7db8a-3915-11e4-9868-02ee2ddab7fe',
				    ssl           : true
				});
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Video Session Connected
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				function connected(session) {
				    video_out.innerHTML = '';
				    video_out.appendChild(session.video);
				
				    PUBNUB.$('number').value = ''+session.number;
				    sounds.play('sound/hi');
				    console.log("Hi!");
				}
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Video Session Ended
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				function ended(session) {
				    set_icon('facetime-video');
				    img_out.innerHTML = '';
				    sounds.play('sound/goodbye');
				    console.log("Bye!");
				}
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Video Session Ended
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				function set_icon(icon) {
				    video_out.innerHTML = '<span class="glyphicon glyphicon-' +
				        icon + '"></span>';
				}
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Request fresh TURN servers from XirSys
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				function get_xirsys_servers() {
				    var servers;
				    $.ajax({
				        type: 'POST',
				        url: 'https://api.xirsys.com/getIceServers',
				        data: {
				            room: 'default',
				            application: 'default',
				            domain: 'www.pubnub-example.com',
				            ident: 'pubnub',
				            secret: 'dec77661-9b0e-4b19-90d7-3bc3877e64ce',
				        },
				        success: function(res) {
				            res = JSON.parse(res);
				            if (!res.e) servers = res.d.iceServers;
				        },
				        async: false
				    });
				    return servers;
				}
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Start Phone Call
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				function dial(number) {
				    // Dial Number
				    var session = phone.dial(number, get_xirsys_servers());
				
				    // No Dupelicate Dialing Allowed
				    if (!session) return;
				
				    // Show Connecting Status
				    set_icon('send');
				}
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Ready to Send or Receive Calls
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				phone.ready(function(){
				    // Ready To Call
				    set_icon('facetime-video');
				
				    // Auto Call
				    if ('call' in urlargs) {
				        var number = urlargs['call'];
				        PUBNUB.$('number').value = number;
				        dial(number);
				    }
				
				    // Make a Phone Call
				    PUBNUB.bind( 'mousedown,touchstart', PUBNUB.$('dial'), function(){
				        var number = PUBNUB.$('number').value;
				        if (!number) return;
				        dial(number);
				    } );
				
				    // Hanup Call
				    PUBNUB.bind( 'mousedown,touchstart', PUBNUB.$('hangup'), function() {
				        phone.hangup();
				        set_icon('facetime-video');
				    } );
				
				    // Take Picture
				    PUBNUB.bind( 'mousedown,touchstart', PUBNUB.$('snap'), function() {
				        var photo = phone.snap();
				        img_self.innerHTML = ' ';
				        img_self.appendChild(photo.image);
				        setTimeout( function() { img_self.innerHTML = ' ' }, 750 );
				    } );
				});
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Received Call Thumbnail
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				function thumbnail(session) {
				    img_out.innerHTML = '';
				    img_out.appendChild(session.image);
				    img_out.appendChild(phone.snap().image);
				}
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Receiver for Calls
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				phone.receive(function(session){
				    session.message(message);
				    session.thumbnail(thumbnail);
				    session.connected(connected);
				    session.ended(ended);
				});
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Chat
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				var chat_in  = PUBNUB.$('pubnub-chat-input');
				var chat_out = PUBNUB.$('pubnub-chat-output');
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Send Chat MSG and update UI for Sending Messages
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				PUBNUB.bind( 'keydown', chat_in, function(e) {
				    if ((e.keyCode || e.charCode) !== 13)     return true;
				    if (!chat_in.value.replace( /\s+/g, '' )) return true;
				
				    phone.send({ text : chat_in.value });
				    add_chat( my_number.number + " (Me)", chat_in.value );
				    chat_in.value = '';
				} )
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Update Local GUI
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				function add_chat( number, text ) {
				    if (!text.replace( /\s+/g, '' )) return true;
				
				    var newchat       = document.createElement('div');
				    newchat.innerHTML = PUBNUB.supplant(
				        '<strong>{number}: </strong> {message}', {
				        message : safetxt(text),
				        number  : safetxt(number)
				    } );
				    chat_out.insertBefore( newchat, chat_out.firstChild );
				}
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// WebRTC Message Callback
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				function message( session, message ) {
				    add_chat( session.number, message.text );
				}
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// XSS Prevent
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				function safetxt(text) {
				    return (''+text).replace( /[<>]/g, '' );
				}
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Problem Occured During Init
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				phone.unable(function(details){
				    console.log("Alert! - Reload Page.");
				    console.log(details);
				    set_icon('remove');
				});
				
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				// Debug Output
				// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
				phone.debug(function(details){
				     console.log(details);
				});
			}
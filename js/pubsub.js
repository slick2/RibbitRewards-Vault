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
            uuid: uuid
        })
        return pubnub
}

function joinLobby() {
    var channel = 'memewarz-lobby-demo-5'    
    var $output = $('#chat-output');
    $('#whoami').text(uuid);
    if (pubnub != null) {
        pubnub.subscribe({
          channel: channel,
          message: function(data) {
            
            var $line = $('<li class="list-group-item"><strong>' + data.username + ':</strong> </span>');
            var $message = $('<span class="text" />').text(data.text).html();
            
            $line.append($message);
            $output.append($line);
            
            $output.scrollTop($output[0].scrollHeight);
        
          }, 
          presence: function(data) {
        
            console.log(data);
        
            // get notified when people join
            if(data.action == "join") {
        
              var $new_user = $('<li id="' + data.uuid + '" class="list-group-item">' + data.uuid + '</li>')
        
              $('#online-users').append($new_user);
              popMsg(data.uuid + "Joined the lobby")
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
        username: uuid
      }
    });
    
    $input.val('');
    
    return false;
    
  });
}

function popMsg(msg) {
        $('.top-right').notify({ message: { text: msg },type: "blackgloss" }).show()
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
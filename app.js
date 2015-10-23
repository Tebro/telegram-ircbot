var irc = require("irc"),
    request = require('request'),
    fs = require('fs');


var telegramToken = "";
var apiBase = "https://api.telegram.org/bot" + telegramToken + "/";
// DB & Settings Setup

var db = null;

var config_file = "config.json";
var database_file = "database.json";
var botNick = "TelegramIrcBot";

var quakeNet;

//Read DB and config
var db_exists = fs.existsSync(database_file);
if (db_exists){
    fs.readFile(database_file, function(err, data){
        db = JSON.parse(data);

        //Let's join some channels from db
        var channels = [];

        db.chats.forEach(function(chat){
            chat.channels.forEach(function(channel){
                if(!contains(channels, channel)){
                    channels.push(channel);
                }
            });
        });
        quakeNet = new irc.Client("irc.quakenet.org", botNick, {channels: channels});
        quakeNet.addListener('message', onMessageCallback);
    });
}else {
    console.log("No database file found, starting with blank slate.");
    db = {
        apiOffset: 0,
        chats: []
    };
}
//Load config
if(fs.existsSync(config_file)){
    fs.readFile(config_file, function(err, data){
        var parsedData = JSON.parse(data);
        telegramToken = parsedData.apiToken;
        apiBase = "https://api.telegram.org/bot" + telegramToken + "/";

        //Test APIcall
        request({uri: apiBase + "getMe"}, function(error, response, body){
            console.log("API TEST RESPONSE: " + body);
        });
    });
}else {
    console.error("Config file \"config.json\" not found!");
    process.exit(1);
}


//End DB setup





function onMessageCallback(from, to, message){
    db.chats.forEach(function (chat) {
        if(typeof chat.getAll != "undefined" && chat.getAll && contains(chat.channels, to)){
            sendTelegramMessage(chat.id, from, to, message);
            return;
        }
        var pattern = "[\\W,]?"+ chat.nick +"([_\\-\\.:\\W]|$)";
        var regex = new RegExp(pattern, "i");
        if(regex.test(message) && contains(chat.channels, to)){
            if(from.indexOf(botNick) > -1) {
                message = message.split(" ");
                var sender = message.splice(0,1);
                sender = sender.join();
                if (sender.indexOf(chat.nick) < 0){
                    message = message.join(" ");
                    sendTelegramMessage(chat.id, sender.substring(1, sender.length-1), to, message);
                }
            }else{
                sendTelegramMessage(chat.id, from, to, message);
            }
        }
    });
}

function sendTelegramMessage(id, from, to, message) {
    request({
        uri: "" + apiBase + "sendMessage",
        method: "POST",
        form: {
            chat_id: id,
            text: "*(" + to + ")<" + from + ">* " + message,
            parse_mode: "Markdown"

        }
    }, function (error, response, body) {
        console.log("MESSAGE SENT: Api response: " + body);
    });
}

function getUpdates(){
    request({
        uri: "" + apiBase + "getUpdates?timeout=9&offset=" + db.apiOffset,
        method: "GET"
    }, function(error, response, body){
        console.log("GOT MESSAGES: " + body);
        var messages = JSON.parse(body);
        if(messages.ok && messages.result.length > 0) {
            messages.result.forEach(function (message) {
                var command = message.message.text.split(" ");
                var chat_id = message.message.chat.id;
                var chat_username = message.message.chat.username;

                var chat_exists = false;
                var theChat;
                for(var i = 0; i < db.chats.length; i++){
                    var chat = db.chats[i];
                    if (chat.id == chat_id) {
                        chat_exists = true;
                        theChat = chat;
                        break;
                    }
                }

                if (!chat_exists) {
                    theChat = {
                        id: chat_id,
                        username: chat_username,
                        nick: "",
                        channels: []
                    }
                }

                switch (command[0]) {
                    case "\/register":
                        var nick = command[1];
                        theChat.nick = nick;
                        break;
                    case "\/addchannel":
                        if(typeof command[1] != "undefined") {
                            var channel = command[1].toLowerCase();
                            theChat.channels.push(channel);
                        }
                        break;
                    case "\/rmchannel":
                        if(typeof command[1] != "undefined") {

                            var channel = command[1].toLowerCase();
                            for (var i = 0; i < theChat.channels.length; i++) {
                                if (theChat.channels[i] == channel) {
                                    theChat.channels.remove(i);
                                }
                            }
                        }
                        break;
                    case "\/msg":
                        if(typeof command[1] != "undefined" && typeof command[2] != "undefined") {
                            var channel = command[1].toLowerCase();
                            command.splice(0,2);
                            var msg = "<" + theChat.nick + "> " +command.join(" ");
                            quakeNet.say(channel, msg);
                            onMessageCallback(botNick, channel, msg);
                        }
                        break;
                    case "\/getall":
                        theChat.getAll = true;
                        break;
                    case "\/getmentions":
                        theChat.getAll = false;
                        break;
                }
                if (!chat_exists) {
                    db.chats.push(theChat);
                }
            });
            updateIrcClient();
            db.apiOffset = messages.result[messages.result.length - 1].update_id + 1;

            //Save the new db to file
            fs.writeFile(database_file, JSON.stringify(db));
        }
    });
}
setInterval(getUpdates, 10000);


function updateIrcClient() {
    var channels = [];

    db.chats.forEach(function (chat) {
        chat.channels.forEach(function (channel) {
            if (!contains(channels, channel)) {
                channels.push(channel);
            }
        });
    });
    //Leave old channels
    if (typeof quakeNet.channels != "undefined") {
        quakeNet.channels.forEach(function (channel) {
            if (!contains(channels, channel)) {
                quakeNet.part(channel);
            }
        });
    }
    //Join new ones
    channels.forEach(function(channel){
       if(typeof quakeNet.channels == "undefined" || !contains(quakeNet.channels, channel)){
           quakeNet.join(channel);
       }
    });

}

function contains(arr, findValue){
    var i = arr.length;
    while (i--){
        if (arr[i] == findValue) return true;
    }
    return false;
}
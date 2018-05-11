module.exports = {
    addNewConfirmation, addNewPagination, setBot, onCollectReaction, removeExisting
}

var reactMessages = [];
var collections = [];
var bot;
const fs = require('fs');
const dbManager = require("./dbmanager.js");
const utils = require('./localutils.js');
const logger = require('./log.js');
const discord = require("discord.js");

fs.readdir('./cards', (err, items) => {
    if(err) console.log(err);
    for (var i = 0; i < items.length; i++) 
        collections.push(items[i].replace('=', ''));
});

function setBot(b) {
    bot = b;
}

function addNewPagination(userID, title, data, channelID) {
    removeExisting(userID);

    var mes = {
        "title": title,
        "page": 1,
        "userID": userID,
        "data": data
    };

    reactMessages.push(mes);

    //bot.sendMessage({to: channelID, message: "```" + data.join('\n') + "```"}, (err, resp) => {
    bot.sendMessage({to: channelID, embed: getPageEmbed(mes)}, (err, resp) => {
        if(!err && data.length > 1) {
            mes.id = resp.id;
            mes.message = resp;
            reactPages(resp);
            setTimeout(()=> removeExisting(mes.userID), 300000);
        } else
            removeExisting(mes.userID);
    });
}

function addNewConfirmation(userID, embed, channelID, onConfirm, onDecline) {
    removeExisting(userID);

    var mes = {
        "userID": userID, 
        "embed": embed,
        "onConfirm": onConfirm,
        "onDecline": onDecline
    };

    reactMessages.push(mes);

    bot.sendMessage({to: channelID, embed: embed}, (err, resp) => {
        if(!err) {
            mes.id = resp.id;
            mes.message = resp;
            reactConfirm(resp);
            setTimeout(()=> removeExisting(mes.userID), 60000);
        }
        else console.log(err);
    });
}

function onCollectReaction(userID, channelID, messageID, emoji) {
    if(processEmoji(userID, channelID, messageID, emoji)) {
        bot.removeReaction({
            channelID: channelID, 
            messageID: messageID, 
            userID: userID, 
            reaction: emoji.name
        });
    }
}

function processEmoji(userID, channelID, messageID, emoji) {
    var mes = reactMessages.filter((o)=> (o.id == messageID && o.userID == userID))[0];
    if(!mes) return false;
    switch(emoji.name) {
        case '⬅':
            if(mes.page && mes.page > 1) {
                mes.page--;
                editMessage(channelID, messageID, getPageEmbed(mes));
            }
            break;
        case '➡':
            if(mes.page && mes.page < mes.data.length) {
                mes.page++;
                editMessage(channelID, messageID, getPageEmbed(mes));
            }
            break;
        case '✅':
            if(mes.onConfirm) mes.onConfirm();
            removeExisting(userID, true);
            break;
        case '❌':
            if(mes.onDecline) mes.onDecline();
            removeExisting(userID, true);
            break;
    }
    return true;
}

function editMessage(channelID, messageID, embedContent) {
    bot.editMessage({channelID: channelID, messageID: messageID, embed: embedContent});
}

function reactPages(message) {
    setTimeout(()=> bot.addReaction({ channelID: message.channel_id, messageID: message.id, reaction: "⬅" }), 200);
    setTimeout(()=> bot.addReaction({ channelID: message.channel_id, messageID: message.id, reaction: "➡" }), 800);
}

function reactConfirm(message) {
    setTimeout(()=> bot.addReaction({ channelID: message.channel_id, messageID: message.id, reaction: "✅" }), 200);
    setTimeout(()=> bot.addReaction({ channelID: message.channel_id, messageID: message.id, reaction: "❌" }), 800);
}

function removeExisting(userID, del = false) {
    var pgn = reactMessages.filter((o)=> o.userID == userID)[0];
    if(pgn){
        if(pgn.message) {
            let mesObj = { 
                channelID: pgn.message.channel_id, 
                messageID: pgn.message.id
            };

            if(del) bot.deleteMessage(mesObj);
            else bot.removeAllReactions(mesObj);
        }

        var index = reactMessages.indexOf(pgn);
        reactMessages.splice(index, 1);
    }
}

function getPageEmbed(pgn) {
    return {
        "color": "3447003",
        "title": pgn.title,
        "description": pgn.data[pgn.page - 1],
        "footer": { text: "Page " + pgn.page + "/" + pgn.data.length }
    }
}

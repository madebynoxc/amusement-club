module.exports = {
    addNewConfirmation, addNewPagination, setBot, onCollectReaction, removeExisting
}

var reactMessages = [];
var bot;
const fs = require('fs');
const dbManager = require("./dbmanager.js");
const utils = require('./localutils.js');
const logger = require('./log.js');

function setBot(b) {
    bot = b;
}

function addNewPagination(userID, title, data, channelID) {
    removeExisting(userID);

    var mes = {
        "title": title,
        "page": 1,
        "userID": userID,
        "data": data,
        "removeID": Math.random(),
        "canReact": userID
    };

    reactMessages.push(mes);

    //bot.sendMessage({to: channelID, message: "```" + data.join('\n') + "```"}, (err, resp) => {
    bot.sendMessage({to: channelID, embed: getPageEmbed(mes)}, (err, resp) => {
        if(!err && data.length > 1) {
            mes.id = resp.id;
            mes.message = resp;
            reactPages(resp);
            setTimeout(()=> removeExisting(mes.userID, false, mes.removeID), 300000);
        } else
            removeExisting(mes.userID);
    });
}

function addNewConfirmation(userID, embed, channelID, onConfirm, onDecline, canReact) {
    removeExisting(userID);
    console.log(canReact);

    var mes = {
        "userID": userID, 
        "embed": embed,
        "onConfirm": onConfirm,
        "onDecline": onDecline,
        "removeID": Math.random(),
        "canReact": canReact? canReact : userID
    };

    reactMessages.push(mes);

    bot.sendMessage({to: channelID, embed: embed}, (err, resp) => {
        if(!err) {
            mes.id = resp.id;
            mes.message = resp;
            reactConfirm(resp);
            setTimeout(()=> removeExisting(mes.userID, false, mes.removeID), 60000);
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
    var mes = reactMessages.filter((o)=> (o.id == messageID && o.canReact == userID))[0];
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

function addReactions(reactions, index = 0) {
    if (index >= reactions.length) { return; }
    bot.addReaction(reactions[index], (err) => {
        if (err) {
            // Too many requests, Discord.io should handle the resend for us
            // but it's stupid and doesn't
            if (err.statusCode === 429) {
                setTimeout(() => addReactions(reactions, index), 500);
            }
        }
        else {
            setTimeout(() => addReactions(reactions, index + 1), 250);
        }
    });
}

function reactPages(message) {
    addReactions([
        { channelID: message.channel_id, messageID: message.id, reaction: "⬅" },
        { channelID: message.channel_id, messageID: message.id, reaction: "➡" }
    ]);
}

function reactConfirm(message) {
    addReactions([
        { channelID: message.channel_id, messageID: message.id, reaction: "✅" },
        { channelID: message.channel_id, messageID: message.id, reaction: "❌" }
    ]);
}

function removeExisting(userID, del = false, removeID = null) {
    var pgn = reactMessages.filter((o)=> o.canReact == userID)[0];
    if(pgn && (!removeID || removeID === pgn.removeID)){

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

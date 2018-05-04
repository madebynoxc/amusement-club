module.exports = {
    setupPagination, addNew, nameCard, setBot, onCollectReaction
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
    for (var i = 0; i < items.length; i++) {
        collections.push(items[i].replace('=', ''));
    }
});

function setBot(b) {
    bot = b;
}

function addNewPagination(user, embed, data, dif = "") {
    removeExisting(user.id);
    var mes = {
        "page": 1,
        "user": user, 
        "data": nameCardList(data),
        "dif": dif
    };
    reactMessages.push(mes);
    return buildCardList(mes);
}

function addNewConfirmation(user, data) {
    removeExisting(user.id);
    var mes = {
        "page": 1,
        "user": user, 
        "data": nameCardList(data),
        "dif": dif
    };
    reactMessages.push(mes);
    return buildCardList(mes);
}

function setupPagination(message, author) {
    if(reactMessages.filter((o)=> o.id == message.id) > 0) return;
    var mes = reactMessages.filter((o)=> o.user.username == author)[0];
    if(!mes) return;

    reactPages(message);

    mes.id = message.id;
    mes.message = message;
    setTimeout(()=> removeExisting(mes.user.id), 300000);
}

function setupConfirmation(message, author) {
    if(reactMessages.filter((o)=> o.id == message.id) > 0) return;
    var mes = reactMessages.filter((o)=> o.user.username == author)[0];
    if(!mes) return;

    reactConfirm(message);

    mes.id = message.id;
    mes.message = message;
    setTimeout(()=> removeExisting(mes.user.id), 300000);
}

function onCollectReaction(userID, channelID, messageID, emoji) {
    if(processEmoji(userID, channelID, messageID, emoji)) {
        var opts = {
            channelID: channelID, 
            messageID: messageID, 
            userID: userID, 
            reaction: emoji.name
        };
        bot.removeReaction(opts);
    }
}

function processEmoji(userID, channelID, messageID, emoji) {
    var mes = reactMessages.filter((o)=> (o.id == messageID && o.user.id == userID))[0];
    if(!mes) return false;
    switch(emoji.name) {
        case '⬅':
            if(mes.page > 1 ) {
                mes.page--;
                editMessage(channelID, messageID, buildCardList(mes));
            }
            break;
        case '➡':
            mes.page++;
            editMessage(channelID, messageID, buildCardList(mes));
            break;
        case '✅':
            mes.data.description = "Confirmed";
            editMessage(channelID, messageID, mes.data);
            break;
        case '❌':
            mes.data.description = "Declined";
            editMessage(channelID, messageID, mes.data);
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

function removeExisting(userID) {
    var pgn = reactMessages.filter((o)=> o.user.id == userID)[0];
    if(pgn){
        if(pgn.message) {
            bot.removeAllReactions({
                messageID: pgn.message.id,
                channelID: pgn.message.channel_id
            });
        }

        var index = reactMessages.indexOf(pgn);
        reactMessages.splice(index, 1);
    }
}

function buildCardList(pgn) {
    if(!pgn.data, pgn.data.length == 0)
        return "**" + pgn.user.username + "**, no cards found matching request \n";

    let pages = Math.floor(pgn.data.length / 15) + 1;
    let overflow = pages > 10;
    if(overflow) pages = 10;
    if(pgn.page > pages) pgn.page = pages;

    var max = Math.min((pgn.page * 15), pgn.data.length);
    let resp = "";
    let emb = new discord.RichEmbed();

    if(pgn.dif) emb.setTitle("**" + pgn.user.username + "**, **" + pgn.dif + "** has following unique cards (**" + pgn.data.length + "** results):");
    else emb.setTitle("**" + pgn.user.username + "**, you have (**" + pgn.data.length + "** results):");

    emb.setDescription(pgn.data.slice(((pgn.page - 1) * 15), max).join('\n'));
    if(pages > 1) emb.setFooter("> Page "+ pgn.page +" of " + overflow? "9+" : pages);
    emb.setColor("#77B520");
    return emb;
}

function nameCardList(arr) {
    let res = [];
    let passedCards = [];
    arr.map(card => {
        let dupe = passedCards.filter(c => (c.name === card.name))[0];
        let name = nameCard(card);

        if(dupe) {
            let d = res.findIndex(c => (c.includes(name)));
            if(d >= 0 && !res[d].includes(dupe.collection)) 
                res[d] += " [" + dupe.collection + "]";
            name += " [" + card.collection + "]";
        }
        let hours = 20 - utils.getHoursDifference(card.frozen);
        if(hours && hours > 0) {
            name += " ❄ ";
            if(hours == 1) {
                let mins = 60 - (utils.getMinutesDifference(card.frozen) % 60);
                name += mins + "m";
            }
            else {
                name += hours + "h";
            }
        }

        passedCards.push(card);
        res.push(name);
    });

    res.sort((a, b) => {
        let match1 = a.match(/★/g);
        let match2 = b.match(/★/g);

        if(!match1) return 1;
        if(!match2) return -1;
        if(match1 < match2) return 1;
        if(match1 > match2) return -1;
        return 0;
    });

    return res;
}

//OBSOLETE
function getCardList(arr, flt) {
    arr.sort(dbManager.dynamicSort("name"));

    if(flt.key) 
        arr = dbManager.getBestCardSorted(arr, flt.keywords.join('_'));

    var res = [];
    var current = null;
    var cnt = 0;

    for (var i = 0; i < arr.length; i++) {
        if(!arr[i]) continue;
        if (!current || arr[i].name != current.name) {
            if (cnt > 0 && (flt.tier == 0 || current.level == flt.tier)) {
                if(!flt.col || flt.collections.includes(current.collection)) {
                    if(!flt.craft || current.craft) {
                        let c = nameCard(current, cnt);
                        if(c && (!flt.multi || cnt > 1)) res.push(c);
                    }
                }
            }
            current = arr[i];
            cnt = 1;
        } else cnt++;
    }
    if (current && (flt.tier == 0 || current.level == flt.tier)) {
        if(!flt.col || flt.collections.includes(current.collection)) {
            if(!flt.craft || current.craft) {
                let c = nameCard(current, cnt);
                if(c && (!flt.multi || cnt > 1)) res.push(c);
            }
        }
    }
    res.sort((a, b) => {
        let match1 = a.match(/★/g);
        let match2 = b.match(/★/g);

        if(!match1) return 1;
        if(!match2) return -1;
        if(match1 < match2) return 1;
        if(match1 > match2) return -1;
        return 0;
    });

    return res;
}

//OBSOLETE
function setFiltering(filter) {
    if(!filter) return {tier: 0};

    let res = {};
    res.tier = 0;
    res.collections = [];
    res.keywords = [];

    filter.forEach(element => {
        if(isInt(element))
            res.tier = parseInt(element);

        else if(element[0] == '-') {
            let el = element.substr(1);
            if(el === "craft") res.craft = true; 
            else if(el === "multi") res.multi = true;
            else if(el === "gif") res.anim = true;
            else {
                col = collections.filter(c => c.includes(el))[0];
                if(col) res.collections.push(col);
            }

        } else res.keywords.push(element.trim());
    }, this);
    res.col = res.collections.length > 0;
    res.key = res.keywords.length > 0;
    //console.log(filter);
    return res;
}

function isInt(value) {
    return !isNaN(value) && 
        parseInt(Number(value)) == value && 
        !isNaN(parseInt(value, 10));
}

function countPages(arr) {
    var realArr = [];
    for(var i=0; i<arr.length; i++) {
        let n = arr[i].name;
        if(!realArr.includes(n)) {
            realArr.push(n);
        }
    }
    return Math.floor(realArr.length / 15) + 1;
}

function nameCard(card) {
    try {
        let res = utils.getFullCard(card);
        if(card.amount > 1) res += " (x" + card.amount + ")";
        return res;
    } catch (e) {logger.error(e);}
    return null;
}
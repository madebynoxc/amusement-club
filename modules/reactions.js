module.exports = {
    setupPagination, addNew, nameCard, setBot, onCollectReaction
}

var paginations = [];
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

function addNew(user, data, dif = "") {
    removeExisting(user.id);
    //var flt = setFiltering(filter);
    var pgn = {
        "page": 1, 
        "user": user, 
        "data": nameCardList(data),
        "dif": dif
    };
    paginations.push(pgn);
    return buildCardList(pgn);
}

function setupPagination(message, author) {
    if(paginations.filter((o)=> o.id == message.id) > 0) return;
    var pgn = paginations.filter((o)=> o.user.username == author)[0];
    if(!pgn) return;

    react(message);

    pgn.id = message.id;
    pgn.message = message;
    /*var collector = message.createReactionCollector(
        (reaction, user) => user.id === pgn.user.id,
        { time: 100000 }
    );
    collector.on('collect', r => {
        processEmoji(r.emoji.name, message);
        r.remove(pgn.user.id).catch();
    });*/
    setTimeout(()=> removeExisting(pgn.user.id), 90000);
}

function onCollectReaction(userID, channelID, messageID, emoji) {
    if(processEmoji(userID, channelID, messageID, emoji)) {
        var opts = {
            channelID: channelID, 
            messageID: messageID, 
            userID: userID, 
            reaction: emoji.name
        };
        console.log(opts);
        bot.removeReaction(opts);
    }
}

function processEmoji(userID, channelID, messageID, emoji) {
    var pgn = paginations.filter((o)=> (o.id == messageID && o.user.id == userID))[0];
    if(!pgn) return false;
    switch(emoji.name) {
        case '⬅':
            if(pgn.page > 1 ) {
                pgn.page--;
                bot.editMessage({channelID: channelID, messageID: messageID, embed: buildCardList(pgn)});
            }
            break;
        case '➡':
            pgn.page++;
            bot.editMessage({channelID: channelID, messageID: messageID, embed: buildCardList(pgn)});
            break;
    }
    return true;
}

function react(message) {
    //message.clearReactions();
    var opts1 = { channelID: message.channel_id, messageID: message.id, reaction: "⬅" };
    var opts2 = { channelID: message.channel_id, messageID: message.id, reaction: "➡" };

    setTimeout(()=> bot.addReaction(opts1), 200);
    setTimeout(()=> bot.addReaction(opts2), 800);
}

function removeExisting(userID) {
    var pgn = paginations.filter((o)=> o.user.id == userID)[0];
    if(pgn){
        if(pgn.message) {
            bot.removeAllReactions({
                messageID: pgn.message.id,
                channelID: pgn.message.channel_id
            });
        }

        var index = paginations.indexOf(pgn);
        paginations.splice(index, 1);
    }
}

function buildCardList(pgn) {
    if(!pgn.data, pgn.data.length == 0)
        return "**" + pgn.user.username + "**, no cards found matching request \n";

    let pages = Math.floor(pgn.data.length / 15) + 1;
    if(pgn.page > pages) pgn.page = pages;

    var max = Math.min((pgn.page * 15), pgn.data.length);
    let resp = "";
    let emb = new discord.RichEmbed();

    if(pgn.dif) emb.setTitle("**" + pgn.user.username + "**, **" + pgn.dif + "** has following unique cards (**" + pgn.data.length + "** results):");
    else emb.setTitle("**" + pgn.user.username + "**, you have (**" + pgn.data.length + "** results):");

    emb.setDescription(pgn.data.slice(((pgn.page - 1) * 15), max).join('\n'));
    if(pages > 1) emb.setFooter("> Page "+ pgn.page +" of " + pages);
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
        let res = "[";

        if(card.collection == "halloween") res += "H";
        else if(card.collection == "valentine") res += "V";
        else {
            for(let i=0; i<parseInt(card.level); i++)
                res += "★"; 
        }
        res += "]  ";
        if(card.fav) res += "❤ "
        if(card.craft) res += "[craft]  ";
        if(card.collection == "christmas") res += "[xmas]  ";
        res += utils.toTitleCase(card.name.replace(/_/g, " "));
        
        if(card.amount > 1) res += " (x" + card.amount + ")";
        return res;
    } catch (e) {logger.error(e);}
    return null;
}
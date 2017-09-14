module.exports = {
    setupPagination, addNew
}

var paginations = [];
const fs = require('fs');
const dbManager = require("./dbmanager.js");
const utils = require('./localutils.js');
const logger = require('./log.js');

var collections = [];
fs.readdir('./cards', (err, items) => {
    if(err) console.log(err);
    collections = items;
});

function addNew(user, filter, data, dif = "") {
    removeExisting(user.id);
    var flt = setFiltering(filter);
    var pgn = {
        "page": 1, 
        "user": user, 
        "filter": flt, 
        "data": getCardList(data, flt), 
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
    var collector = message.createReactionCollector(
        (reaction, user) => user.id === pgn.user.id,
        { time: 100000 }
    );
    collector.on('collect', r => {
        processEmoji(r.emoji.name.trim(), message);
        r.remove(pgn.user.id).catch();
    });
    collector.on('end', collected => {
        removeExisting(pgn.user.id);
    });
}

function processEmoji(e, message) {
    var pgn = paginations.filter((o)=> o.id == message.id)[0];
    if(!pgn) return;
    switch(e) {
        case '⬅':
            if(pgn.page > 1 ) {
                pgn.page--;
                message.edit(buildCardList(pgn));
            }
            break;
        case '➡':
            pgn.page++;
            message.edit(buildCardList(pgn));
            break;
    }
    //resetReact(message);
}

function react(message) {
    //message.clearReactions();
    setTimeout(()=> message.react("⬅")
    .catch(e => { 
        message.channel.send("This function requires 'Add reactions' permission. "
        + "Please, ask server admin to give bot this permission. "
        + "You can call this command in Direct Messages for now"); 
        return;
    }), 50);
    setTimeout(()=> message.react("➡").catch(), 400)
}

function removeExisting(userID) {
    var pgn = paginations.filter((o)=> o.user.id == userID)[0];
    if(pgn){
        if(pgn.message) pgn.message.clearReactions();
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

    if(pgn.dif) resp += "**" + pgn.user.username 
        + "**, **" + pgn.dif + "** has following unique cards: \n";
    else resp += "**" + pgn.user.username + "**, you have: \n";

    resp += pgn.data.slice(((pgn.page - 1) * 15), max).join('\n');
    if(pages > 1) resp += "\n \u{1F4C4} Page "+ pgn.page +" of " + pages;
    return resp;
}

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
    if (flt.tier == 0 || current.level == flt.tier) {
        if(!flt.col || flt.collections.includes(current.collection)) {
            if(!flt.craft || current.craft) {
                let c = nameCard(current, cnt);
                if(c && (!flt.multi || cnt > 1)) res.push(c);
            }
        }
    }
    res.sort((a, b) => {
        if(a.match(/★/g) < b.match(/★/g)) return 1;
        if(a.match(/★/g) > b.match(/★/g)) return -1;
        return 0;
    });

    return res;
}

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

function nameCard(card, count) {
    try {
        let res = "[";

        for(let i=0; i<parseInt(card.level); i++)
            res += "★";

        res += "]  ";
        if(card.craft) res += "[craft]  ";
        res += utils.toTitleCase(card.name.replace(/_/g, " "));
        
        if(count > 1) res += " (x" + count + ")";
        return res;
    } catch (e) {logger.error(e);}
    return null;
}
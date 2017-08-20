module.exports = {
    setupPagination, addNew
}

var paginations = [];
const dbManager = require("./dbmanager.js");
const utils = require('./localutils.js');

function addNew(user, tier, page, data) {
    removeExisting(user.id);
    //data.sort(dbManager.dynamicSort("level"));
    var pgn = {"page": page, "user": user, "tier": tier, "data": data};
    paginations.push(pgn);
    return buildCardList(pgn);
}

function setupPagination(message, author) {
    if(paginations.filter((o)=> o.id == message.id) > 0) return;
    var pgn = paginations.filter((o)=> o.user.username == author)[0];
    react(message);

    pgn.id = message.id;
    var collector = message.createReactionCollector(
        (reaction, user) => user.id === pgn.user.id,
        { time: 100000 }
    );
    collector.on('collect', r => {
        //message.clearReactions();
        processEmoji(r.emoji.name.trim(), message);
        r.remove(pgn.user.id).catch();
    });
    collector.on('end', collected => {
        message.clearReactions();
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
        var index = paginations.indexOf(pgn);
        paginations.splice(index, 1);
    }
}

function buildCardList(pgn) {
    let pages = countPages(pgn.data);
    if(pgn.page > pages) pgn.page = pages;

    //let cur = "(showing only " + type + "-star cards) \n"
    let resp = "**" + pgn.user.username + "**, you have: \n";
    //if(type > 0) resp += cur;
    resp += countDuplicates(pgn.data, 0, pgn.page);
    if(pages > 1) resp += "\n \u{1F4C4} Page "+ pgn.page +" of " + pages;
    return resp;
}

function countDuplicates(arr, type, page) {
    page--;
    arr.sort(dbManager.dynamicSort("name"));
    if(type < 0) type = 0;

    var res = [];
    var current = null;
    var cnt = 0;
    var max = Math.min(((page + 1) * 15), arr.length);
    for (var i = (page * 15); i < max; i++) {
        if(!arr[i]) continue;
        if (!current || arr[i].name != current.name) {
            if (cnt > 0 && (current.level == type || type == 0)) {
                let c = nameCard(current, cnt);
                if(c) res.push(c);
            }
            current = arr[i];
            cnt = 1;
        } else {
            max++;
            cnt++;
        }
    }
    if (cnt > 0 && (current.level == type || type == 0)) {
        let c = nameCard(current, cnt);
        if(c) res.push(c);
    }
    res.sort().reverse();

    return res.join('\n');
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
        res += utils.toTitleCase(card.name.replace(/_/g, " "));
        
        if(count > 1) res += " (x" + count + ")";
        return res;
    } catch (e) {}
    return null;
}
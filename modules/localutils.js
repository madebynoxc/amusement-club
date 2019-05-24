const colors = {
    red: 14356753,
    yellow: 16756480,
    green: 1030733,
    blue: 1420012,
    grey: 3553598
}

module.exports = {
    colors,
    getRegexString,
    parseToSeconds,
    msToTime,
    HEXToVBColor,
    getSourceFormat,
    toTitleCase,
    getSecondsDifference,
    getMinutesDifference,
    getHoursDifference,
    getDaysDifference,
    getFullTimeDifference,
    isInt,
    sortByStars,
    containsCard,
    cardsMatch,
    canSend,
    canGet,
    formatError,
    formatConfirm,
    formatInfo,
    formatWarning,
    getRequestFromFilters,
    getRequestFromFiltersNoPrefix,
    getRequestFromFiltersWithPrefix,
    getUserID,
    getRatio,
    getCardQuery,
    generateRandomId,
    generateNextId,
    getFullCard,
    formatImage,
    cardComparator,
    diff
}

const fs = require('fs');
let collections = require('./collections.js');

function getSourceFormat(str) {
    return str.replace(' ', '');
}

function getRegexString(arr) {
    var ln = _formatSymbols(arr[0]);
    for(var j=1; j<arr.length; j++) {
        ln += '.*' + _formatSymbols(arr[j]);
    }
    return ln;
}

function _formatSymbols(word) {
    return word 
        .replace('.', '\\.')
        .replace('?', '\\?')
        .replace(']', '')
        .replace('[', '')
        .replace('_', ' ');
}

function HEXToVBColor(rrggbb) {
    var bbggrr = rrggbb.substr(4, 2) + rrggbb.substr(2, 2) + rrggbb.substr(0, 2);
    return parseInt(bbggrr, 16);
}

function parseToSeconds(inp) {
    var c = inp.split(':');
    return parseInt(c[0]) * 3600 
    + parseInt(c[1]) * 60
    + parseFloat(c[2]);
}

function toTitleCase(str) {
    return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
}

function msToTime(s) {

  function pad(n, z) {
    z = z || 2;
    return ('00' + n).slice(-z);
  }

  var ms = s % 1000;
  s = (s - ms) / 1000;
  var secs = s % 60;
  s = (s - secs) / 60;
  var mins = s % 60;
  var hrs = (s - mins) / 60;

  return pad(hrs) + ':' + pad(mins) + ':' + pad(secs) + '.' + pad(ms, 3);
}

function getDaysDifference(tg) {
    let mil = new Date() - tg;
    return Math.floor(mil / (1000*60*60*24));
}

function getHoursDifference(tg) {
    let mil = new Date() - tg;
    return Math.floor(mil / (1000*60*60));
}

function getMinutesDifference(tg) {
    let mil = new Date() - tg;
    return Math.floor(mil / (1000*60));
}

function getSecondsDifference(tg) {
    let mil = new Date() - tg;
    return Math.floor(mil / (1000));
}

function getFullTimeDifference(tg) {
    let mil = new Date() - tg;
    return msToTime(mil);
}

function isInt(value) {
    return !isNaN(value) && 
        parseInt(Number(value)) == value && 
        !isNaN(parseInt(value, 10));
}

function sortByStars(cards) {
    cards.sort((a, b) => {
        let match1 = a.name.match(/★/g);
        let match2 = b.name.match(/★/g);

        if(!match1) return 1;
        if(!match2) return -1;
        if(match1 < match2) return 1;
        if(match1 > match2) return -1;
        return 0;
    });
    return cards;
}

function getRequestFromFiltersWithPrefix(args, prefix) {
    prefix = prefix || "";
    let query = {sortBy: { }};
    let keywords = [];
    let levelInclude = [];
    let levelExclude = [];
    let collectionInclude = [];
    let collectionExclude = [];
    let date = new Date();
    date.setDate(date.getDate() - 1);
    query.sortBy[prefix + 'level'] = -1;

    //console.log(args);
    if(!args || args.length == 0) return query;
    args.forEach(element => {
        element = element.trim();
        if(isInt(element) && parseInt(element) <= 5 && parseInt(element) > 0)
            levelInclude.push(parseInt(element));

        else if(element[0] == '-') {
            let el = element.substr(1);
            if(el === "craft") query[prefix + 'craft'] = true; 
            else if(el === "multi") query[prefix + 'amount'] = {$gte: 2};
            else if(el === "gif") query[prefix + 'animated'] = true;
            else if(el === "fav") query[prefix + 'fav'] = true;
            else if(el === "new") query[prefix + 'obtained'] = {$gt: date};
            else if(el === "frozen") {
                var yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                query[prefix + 'frozen'] = {$gte: yesterday};
            }
            else {
                col = collections.parseCollection(el);
                col.map(c => collectionInclude.push(c.id));
            }
        }
        else if(element[0] == '!') {
            let el = element.substr(1);
            if(isInt(el) && parseInt(el) <= 5 && parseInt(el) > 0)
                levelExclude.push(parseInt(el));
            if(el === "craft") query[prefix + 'craft'] = false; 
            else if(el === "multi") query[prefix + 'amount'] = {$eq: 1};
            else if(el === "gif") query[prefix + 'animated'] = false;
            else if(el === "fav") query[prefix + 'fav'] = {$in: [null, false]};
            else if(el === "new") query[prefix + 'obtained'] = {$lt: date};
            else if(el === "frozen") {
                var yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                query[prefix + 'frozen'] = {$lte: yesterday};
            }
            else {
                col = collections.parseCollection(el);
                col.map(c => collectionExclude.push(c.id));
            }
        } else if(element[0] == '>' || element[0] == '<') {
            let el = element.substr(1);
            let accend = element[0] == '>'? -1 : 1;
            query.sortBy = {};

            if(el === "star") query.sortBy[prefix + 'level'] = accend;
            else if(el === "date") query.sortBy = null;
            else if(el === "name") query.sortBy[prefix + 'name'] = accend;
            else if(el.startsWith("col")) query.sortBy[prefix + 'collection'] = accend;
            else if(el === "amount") query.sortBy[prefix + 'amount'] = accend;
            else query.sortBy[prefix + 'level'] = -1;

        } else if(element[0] == '#') {
            let el = element.substr(1);
            if(!query[prefix + 'tags']) 
                query[prefix + 'tags'] = {$in: []};

            query[prefix + 'tags'].$in.push(el);

        } else keywords.push(element.trim());
    }, this);

    if(levelExclude.length > 0 || levelInclude.length > 0) {
        query[prefix + 'level'] = {};
        if(levelExclude.length > 0) {
            query[prefix + 'level'].$nin = levelExclude;
        }
        if(levelInclude.length > 0) {
            query[prefix + 'level'].$in = levelInclude;
        }
    }
    
    if(collectionExclude.length > 0 || collectionInclude.length > 0) {
        query[prefix + 'collection'] = {};
        if(collectionExclude.length > 0) {
            query[prefix + 'collection'].$nin = collectionExclude;
        }
        if(collectionInclude.length > 0) {
            query[prefix + 'collection'].$in = collectionInclude;
        }
    }

    if(keywords.length > 0) {
        try{
            let keywordString = keywords.join('_');
            query[prefix + 'name'] = new RegExp("(_|^)" + keywordString, 'ig');
        } catch(e) {}
    } 

    return query;
}

function getRequestFromFilters(args) {
    return getRequestFromFiltersWithPrefix(args, "cards.");
}

function getRequestFromFiltersNoPrefix(args) {
    let c = getRequestFromFiltersWithPrefix(args, "");
    delete c["sortBy"];
    return c;
}

function getCardQuery(card) {
    return {
        name: new RegExp('^' + card.name + '$', 'i'),
        collection: card.collection,
        level: card.level
    }
}

function containsCard(array, card) {
    return array.filter(c => cardsMatch(c, card))[0];
}

function cardsMatch(card1, card2) {
    return (card1.name.toLowerCase() === card2.name.toLowerCase() && 
            card1.collection === card2.collection && 
            card1.level === card2.level);
}

function canSend(user) {
    var snd = user.sends || 1;
    var get = user.gets || 1;
    var rel = snd/get;
    return rel < 2.5;
}

function canGet(user) {
    var snd = user.sends || 1;
    var get = user.gets || 1;
    var rel = snd/get;
    return rel > 0.4;
}

function getRatio(user) {
    return (user.sends || 1)/(user.gets || 1);
}

function formatError(user, title, body) {
    return getEmbed(user, title, body, colors.red);
}

function formatConfirm(user, title, body) {
    return getEmbed(user, title, body, colors.green); //#77B520
}

function formatInfo(user, title, body) {
    return getEmbed(user, title, body, colors.blue); //#15aaec
}

function formatWarning(user, title, body) {
    return getEmbed(user, title, body, colors.yellow); //#ffc711
}

function formatImage(user, title, body, link) {
    let e = getEmbed(user, title, body, colors.grey);
    e.image = { "url": link };
    return e;
}

// function formatImage(user, title, body, link) {
//     let resp = "";
//     if(user) resp += "**" + user.username + "**, " + body;
//     else resp += body;
//     resp += "\n" + link;
//     return resp;
// }

function getEmbed(user, title, body, color) {
    let emb = { };
    if(title) emb.title = title;
    if(user) emb.description = "**" + user.username + "**, " + body;
    else emb.description = body;
    emb.color = color;
    return emb;
}

function getUserID(inp) {
    let ret = { };
    for (var i = 0; i < inp.length; i++) {
        try {
            if (/^\d+$/.test(inp[i]) && inp[i] > (1000 * 60 * 60 * 24 * 30 * 2 ** 22)){
                ret.id = inp[i];
                inp.splice(i, 1);
                break;
            }
            else {
                ret.id = inp[i].slice(0, -1).split('@')[1].replace('!', '');
                inp.splice(i, 1);
                break;
            }
        }
        catch(err) {continue}
    }
    ret.input = inp;
    return ret;
}

function generateRandomId() {
    return (Date.now().toString(36).substr(2, 3) + Math.random().toString(36).substr(2, 5));
}

function generateNextId(last) {
    var num = parseInt(last, 36);
    num += Math.pow(77, 4);
    num %= Math.pow(36, 5);
    return next = num.toString(36);
}

function getFullCard(card) {
    let res = "[`";

    if(card.collection == "halloween") res += "🎃";
    else if(card.collection == "halloween18") res += "🍬";
    else if(card.collection == "valentine") res += "🍫";
    else if(card.collection == "birthday") res += "🍰";
    else if(card.collection == "christmas18") res += "🎄";
    else {
        for(let i=0; i<parseInt(card.level); i++) {
            if(card.collection == "christmas") 
                res += "❄";
            else
                res += "★"; 
        }
    }
    res += "`]  ";
    if(card.fav) res += "`❤` "
    if(card.craft) res += "[craft]  ";

    res += toTitleCase(card.name.replace(/_/g, " "));
    res += " `[" + card.collection + "]`";
    return res;
}

/// Compares two cards for sorting
/// Guarantees that no two different cards will compare as equal 
function cardComparator(a, b) {
    if (a.level < b.level) {
        return 1;
    }
    if (a.level > b.level) {
        return -1;
    }
    if (a.collection < b.collection) {
        return -1;
    }
    if (a.collection > b.collection) {
        return 1;
    }
    let alc = a.name.toLowerCase();
    let blc = b.name.toLowerCase();
    if (alc < blc) {
        return -1;
    }
    if (alc > blc) {
        return 1;
    }
    return 0;
}

/// Finds differences in the first and second arrays
/// - parameter first: An array of objects
/// - parameter second: An array of objects
/// - parameter comparator: A comparator usable in the sort function.  Defaults to cardComparator.
/// - returns: An object with properites `firstOnly`, `secondOnly`, and `both`, all of which are arrays
function diff(first, second, comparator) {
    let firstOnly = [], secondOnly = [], both = [];
    if (!comparator) {
        comparator = cardComparator;
    }
    let firstSorted = first.sort(comparator);
    let secondSorted = second.sort(comparator);
    let i1 = 0;
    let i2 = 0;
    while (i1 < firstSorted.length && i2 < secondSorted.length) {
        let compared = comparator(firstSorted[i1], secondSorted[i2]);
        if (compared < 0) {
            firstOnly.push(firstSorted[i1]);
            i1 += 1;
        }
        else if (compared > 0) {
            secondOnly.push(secondSorted[i2]);
            i2 += 1;
        }
        else {
            both.push(firstSorted[i1]);
            i1 += 1;
            i2 += 1;
        }
    }
    if (i1 < firstSorted.length) {
        firstOnly = firstOnly.concat(firstSorted.slice(i1));
    }
    if (i2 < secondSorted.length) {
        secondOnly = secondOnly.concat(secondSorted.slice(i2));
    }
    return {firstOnly: firstOnly, secondOnly: secondOnly, both: both}
}

// db.getCollection('users').aggregate([
// {"$match":{"discord_id":"218871036962275338"}},
// {"$unwind":"$cards"},
// {"$match":{"cards.level":3, "cards.name":/illya/i}},
// {"$group": {_id: 0, cards: {"$push": "$cards"}}},
// {"$project": {cards: '$cards', _id: 0}}
// ])

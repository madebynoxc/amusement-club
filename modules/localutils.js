module.exports = {
    getRegexString,
    parseToSeconds,
    msToTime,
    HEXToVBColor,
    getSourceFormat,
    toTitleCase,
    getMinutesDifference,
    getHoursDifference,
    getFullTimeDifference,
    isInt,
    sortByStars,
<<<<<<< Updated upstream
    containsCard,
    cardsMatch,
    canSend,
    canGet,
    formatError
}

const discord = require("discord.js");
=======
    getRequestFromFilters
}

const fs = require('fs');

let collections = [];
fs.readdir('./cards', (err, items) => {
    if(err) console.log(err);
    for (let i = 0; i < items.length; i++) {
        collections.push(items[i].replace('=', ''));
    }
});
>>>>>>> Stashed changes

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

function getHoursDifference(tg) {
    let mil = new Date() - tg;
    return Math.floor(mil / (1000*60*60));
}

function getMinutesDifference(tg) {
    let mil = new Date() - tg;
    return Math.floor(mil / (1000*60));
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

function getRequestFromFilters(args) {
    let query = {};
    let keywords = [];

    console.log(args);
    args.forEach(element => {
        if(isInt(element))
            query['cards.level'] = parseInt(element);

        else if(element[0] == '-') {
            let el = element.substr(1);
            if(el === "craft") query['cards.craft'] = true; 
            //else if(el === "multi") query.amount = {$gte: 1};
            else if(el === "gif") query['cards.anim'] = true;
            else {
                col = collections.filter(c => c.includes(el))[0];
                if(col) query['cards.collection'] = col;
            }

        } else keywords.push(element.trim());
    }, this);

    if(keywords) query['cards.name'] = new RegExp(keywords.join('_'), 'ig');

    return query;
}

function containsCard(array, card) {
    return array.filter(c => cardsMatch(c, card)) == 0;
}

function cardsMatch(card1, card2) {
    return (card1.name === card2.name && 
            card1.collection === card2.collection && 
            card1.level === card2.level);
}

function canSend(user) {
    var rel = user.sends / user.gets;
    return (user.sends + user.gets < 20) || isNaN(rel) || rel < 2.5;
}

function canGet(user) {
    var rel = user.gets / user.sends;
    return (user.sends + user.gets < 20) || isNaN(rel) || rel < 2.5;
}

function formatError(user, title, body) {
    let emb = new discord.RichEmbed();
    emb.title = title;
    emb.description = user.username + ", " + body;
    emb.color = "#f51d1d";
    return emb;
}

function formatConfirm(user, title, body) {
    let emb = new discord.RichEmbed();
    emb.title = title;
    emb.description = user.username + ", " + body;
    emb.color = "#26dc26";
    return emb;
}

function formatInfo(user, title, body) {
    let emb = new discord.RichEmbed();
    emb.title = title;
    emb.description = user.username + ", " + body;
    emb.color = "#15aaec";
    return emb;
}

// db.getCollection('users').aggregate([
// {"$match":{"discord_id":"218871036962275338"}},
// {"$unwind":"$cards"},
// {"$match":{"cards.level":3, "cards.name":/illya/i}},
// {"$group": {_id: 0, cards: {"$push": "$cards"}}},
// {"$project": {cards: '$cards', _id: 0}}
// ])

module.exports = {
    connect, processRequest, getHeroEffect, getHeroLevel, addXP
}

var mongodb, ucollection;
const fs = require('fs');
const logger = require('./log.js');
const dbManager = require('./dbmanager.js');
const heroDB = require('../heroes/heroes.json');
const quests = require('./quest.js');
const forge = require('./forge.js');

function connect(db) {
    mongodb = db;
    ucollection = db.collection('users');
}

function processRequest(userID, args, callback) {
    ucollection.findOne({ discord_id: userID }).then((dbUser) => {
        if(!dbUser) return;

        var req = args.shift();
        switch(req) {
            case undefined:
                getHero(dbUser, callback);
                break;
            case "list":
                getHeroes(dbUser, callback);
                break;
            case "info":
                getInfo(dbUser, args, callback);
                break;
            case "get":
                assign(dbUser, args, callback);
                break;
            case "lead":
                getRating(dbUser, callback);
                break;
        }
    });
}

function getHero(dbUser, callback) {
    var h = dbUser.hero;
    if(!h) {
        let stars = dbManager.countCardLevels(dbUser.cards);
        var msg = "**" + dbUser.username + "**, you have no any hero yet. \n";
        if(stars >= 50) msg += "To choose one, use `->hero list`";
        else msg += "You can get one once you have more than 50 \u2B50 stars (you have now " + stars + "\u2B50 stars)";
        callback(msg);
        return;
    }

    callback(h.subname + " **" + h.name + "** level **" + getHeroLevel(h.exp) + "** arrives!", 
        { file: "./heroes/" + h.name.toLowerCase().replace(/ /g, "_") + ".png" });
}

function getHeroes(dbUser, callback) {
    let stars = dbManager.countCardLevels(dbUser.cards);
    if(stars < 50) {
        callback("**" + dbUser.username + "**, you should have at least 50 \u2B50 stars to have a hero.\n"
            + "You have now " + stars + " \u2B50 stars.");
        return;
    }
    
    callback("Use `->hero info [hero name]` or `->hero info all`", { file: "./heroes/list.png" });
}

function getInfo(dbUser, args, callback) {
    var req = args.join(' ');
    if(req == 'all') {
        callback("Use `->hero get [hero name]`.\n"
            + "Use `->hero info [hero name]` to get specific hero info", 
            { file: "./heroes/all.png" });
        return;
    }

    if(req == '' || req == ' ') return;
    var h = heroDB.filter(h => h.name.toLowerCase().includes(req))[0];
    if(h) {
        console.log(h.name.toLowerCase().replace(/ /g, "_"));
        callback("Use `->hero get [hero name]`.", 
            { file: "./heroes/" + h.name.toLowerCase().replace(/ /g, "_") + ".png" });
    }
}

function assign(dbUser, args, callback) {
    var hasHero = dbUser.hero != undefined;
    if(hasHero) {
        if(dbUser.exp < 2000) {
            callback("**" + dbUser.username + "**, hero change requires 2000 Tomatoes!\n");
            return;
        }
    }

    var stars = dbManager.countCardLevels(dbUser.cards);
    if(stars < 50) {
        callback("You can get one once you have more than 50 \u2B50 stars (you have now " + stars + "\u2B50 stars)");
        return;
    }

    var req = args.join(' ');
    if(req == '' || req == ' ') return;

    var h = heroDB.filter(h => h.name.toLowerCase().includes(req))[0];
    if(h) {
        var upd = hasHero? {$set: {hero: h}, $inc: {exp: -2000}} : {$set: {hero: h}};
        ucollection.update(
            { discord_id: dbUser.discord_id },
            upd
        ).then(() => {
            callback("**" + dbUser.username + "** and **" 
                + h.name + "** made a contract! Congratulations! \u{1F389}");
        });
        
    } else {
        callback("Can't find hero named '" + req + "'");
    }
}

function getHeroLevel(exp) {
    var lvl = 1;
    var targetExp = 1.5;
    while((targetExp = Math.pow(1.5, lvl)) < exp) lvl++;
    var rem = (exp/targetExp).toString();
    
    if(!rem[2] || !rem[3]) return lvl + '.00';
    return lvl + '.' + rem[2] + rem[3];
}

function addXP(user, amount) {
    if(user.hero) {
        amount = forge.getCardEffect(user, 'heroup', amount)[0];
        ucollection.update(
            { discord_id: user.discord_id }, 
            {$inc: {'hero.exp': amount}}
        );
    }
}

function getHeroEffect(user, action, value, ...params) {
    if(user.hero) {
        switch(user.hero.name.toLowerCase()) {
            case 'akaza akari':
                if(action == 'claim_akari') return Math.floor(value *.88);
                if(action == 'send') return value + (params[0] * 80);
                break;
            case 'toshino kyoko':
                if(action == 'addXP') return value * 2;
                if(action == 'forge') {  }
                break;
            case 'funami yui':
                if(action == 'daily') return value * 80;
                if(action == 'rating') return value + countAnimated(user.cards);
                break;
            case 'yoshikawa chinatsu':
                if(action == 'questReward') return Math.floor(value * 1.8);
                if(action == 'questComplete') {
                    quests.addBonusQuest(user, () => {
                        value("Dark spell from Chinatsu granted you another quest! Use `->quest` to see it");
                    });
                }
                break;
        }
    }
    return value;
}

function getRating(user, callback) {
    ucollection.find({ }).sort({'hero.exp': -1}).toArray((err, users) => {
        callback("**Global** hero rating:\n" + nameOwners(users));
    });
}

function nameOwners(col) {
    let res = '';
    for(let i=0; i<col.length; i++) {
        if(!col[i].hero || !col[i].hero.name) continue;
        res += (i+1).toString() + ". ";
        res += "**" + col[i].username + "** -- [";
        res += col[i].hero.name + "] -- **";
        res += getHeroLevel(col[i].hero.exp) + "**\n";
        if(i >= 9) break;
    }
    return res;
}

function countAnimated(cards) {
    var c = 0;
    cards.forEach(function(element) {
        if(element.animated) c += element.level;
    }, this);
    return c;
}
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
const react = require('./reactions.js');
const utils = require('./localutils.js');

function connect(db) {
    mongodb = db;
    ucollection = db.collection('users');
}

function processRequest(userID, args, guild, channelID, callback) {
    ucollection.findOne({ discord_id: userID }).then((dbUser) => {
        if(!dbUser) return;

        var req = args.shift();
        switch (req) {
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
                assign(dbUser, args, channelID, callback);
                break;
            case "lead":
                getRating(guild, args[0], callback);
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
        "./heroes/" + h.name.toLowerCase().replace(/ /g, "_") + ".png");
}

function getHeroes(dbUser, callback) {
    let stars = dbManager.countCardLevels(dbUser.cards);
    if(stars < 50) {
        callback("**" + dbUser.username + "**, you should have at least 50 \u2B50 stars to have a hero.\n"
            + "You have now " + stars + " \u2B50 stars.");
        return;
    }
    
    callback("Use `->hero info [hero name]` or `->hero info all`", "./heroes/list.png");
}

function getInfo(dbUser, args, callback) {
    var req = args.join(' ');
    if(req == 'all') {
        callback("Use `->hero get [hero name]`.\n"
            + "Use `->hero info [hero name]` to get specific hero info", 
            "./heroes/all.png");
        return;
    }

    if(req == '' || req == ' ') return;
    var h = heroDB.filter(h => h.name.toLowerCase().includes(req))[0];
    if(h) {
        console.log(h.name.toLowerCase().replace(/ /g, "_"));
        callback("Use `->hero get [hero name]`.", 
            "./heroes/" + h.name.toLowerCase().replace(/ /g, "_") + ".png");
    }
}

function assign(dbUser, args, channelID, callback) {
    var hasHero = dbUser.hero != undefined;
    if(hasHero) {
        if(dbUser.exp < 2500)
            return callback(utils.formatError(dbUser, null, "hero change requires 2000 Tomatoes!\n"));

        if(dbUser.lastHeroChange) {
            let hours = 168 - utils.getHoursDifference(dbUser.lastHeroChange);
            let days = Math.floor(hours/24);
            if(hours > 0)
                return callback(utils.formatError(dbUser, "Can't change hero", 
                    "you can get new hero in **" + days + " days " + (hours - days*24) + " hours**"));
        }
    }

    var stars = dbManager.countCardLevels(dbUser.cards);
    if(stars < 50)
        return callback(utils.formatError(dbUser, null, 
            "you can get one once you have more than 50 \u2B50 stars (you have " + stars + "\u2B50 stars)"));

    var req = args.join(' ');
    if(req == '' || req == ' ') return;

    var h = heroDB.filter(h => h.name.toLowerCase().includes(req))[0];
    if(h) {
        if(hasHero)
            react.addNewConfirmation(dbUser.discord_id, 
                utils.formatWarning(dbUser, "You want to change your hero?", "hero change will cost you **2500** Tomatoes\nYou can change hero once a week"), 
                channelID, () => switchHero(h, dbUser, callback));
        else switchHero(h, dbUser, callback);
        
    } else
        callback(utils.formatError(null, null, "Can't find hero `" + req + "`"));
}

function switchHero(newHero, dbUser, callback) {
    var upd = dbUser.hero? {$set: {"hero.name": newHero.name, lastHeroChange: new Date()}, $inc: {exp: -2500}} 
        : {$set: {hero: newHero, lastHeroChange: new Date()}};

    ucollection.update(
        { discord_id: dbUser.discord_id }, upd
    ).then(() => {
        callback(utils.formatConfirm(dbUser, "Yaaay!", "you made contract with **" 
            + newHero.name + "**! Congratulations! \u{1F389} \nUse `->hero` to summon your new companion and view her level"));
    });
}

function getHeroLevel(exp) {
    return Math.floor((Math.log(exp) / Math.log(5)) * Math.sqrt(exp));
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
                if(action == 'claim_akari') return Math.floor(value *.65);
                //;~;\\
                break;
            case 'toshino kyoko':
                if(action == 'auc') return true;
                if(action == 'forge') return 0;
                break;
            case 'funami yui':
                if(action == 'daily') return 300 + (value * 100);
                if(action == 'cooldown') return Math.floor(value * .5);
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

function getRating(guild, arg, callback) {
    if (arg === "global") {
        ucollection.aggregate([
            { $project: { _id: '$username', hero: '$hero' } },
            { $sort: { 'hero.exp': -1 } },
            { $limit: 10 }
        ]).toArray((err, users) => {
            callback("**Global** hero rating:\n" + nameOwners(users));
        });
    } else {
        var users = Object.keys(guild.members);
        ucollection.aggregate([
            { $match: { discord_id: { $in: users }, hero: { $exists: true } } },
            { $project: { _id: '$username', hero: '$hero' } },
            { $sort: { 'hero.exp': -1 } }
        ]).limit(10).toArray((err, users) => {
            if (!users) return callback("**Local** hero rating:\nNo heroes found on this server.")
            callback("**Local** hero rating:\n" + nameOwners(users));
        });
    }
}

function nameOwners(col) {
    let res = '';
    for (let i = 0; i < col.length; i++) {
        if (!col[i].hero || !col[i].hero.name) continue;
        res += (i + 1).toString() + ". ";
        res += "**" + col[i]._id + "** -- [";
        res += col[i].hero.name + "] -- **";
        res += getHeroLevel(col[i].hero.exp) + "**\n";
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

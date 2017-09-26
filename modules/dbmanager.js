module.exports = {
    connect, disconnect, claim, addXP, getXP, doesUserHave,
    getCards, summon, transfer, sell, award, getUserName,
    pay, daily, fixUserCards, getQuests, getBestCardSorted,
    leaderboard_new, difference, dynamicSort, countCardLevels, 
    getCardFile, getDefaultChannel
}

var MongoClient = require('mongodb').MongoClient;
var mongodb;
var cooldownList = [];

const fs = require('fs');
const assert = require('assert');
const logger = require('./log.js');
const quest = require('./quest.js');
const heroes = require('./heroes.js');
const _ = require("lodash");
const randomColor = require('randomcolor');
const settings = require('../settings/general.json');
const guilds = require('../settings/servers.json');
const utils = require('./localutils.js');
const listing = require('./reactions.js');
const cardmanager = require('./cardmanager.js');
const forge = require('./forge.js');
const inv = require('./inventory.js');
const stats = require('./stats.js');
const invite = require('./invite.js');
const lev = require('js-levenshtein');

function disconnect() {
    isConnected = false;
    media.clearTemp();
    mongodb.close();
}

function connect(callback) {
    MongoClient.connect(settings.database, function(err, db) {
        assert.equal(null, err);
        logger.message("Connected correctly to database");

        mongodb = db;
        quest.connect(db);
        heroes.connect(db);
        forge.connect(db);
        inv.connect(db);
        stats.connect(db);
        cardmanager.updateCards(db);
        invite.connect(db);

        if(callback) callback();   
    });
}

function claim(user, guildID, arg, callback) {
    let ucollection = mongodb.collection('users');
    ucollection.findOne({ discord_id: user.id }).then((dbUser) => {
        if(!dbUser) return;

        let stat = dbUser.dailystats;
        if(!stat) stat = {summon:0, send: 0, claim: 0, quests: 0};

        let claimCost = (stat.claim + 1) * 50;
        let nextClaim = claimCost + 50;
        claimCost = heroes.getHeroEffect(dbUser, 'claim_akari', claimCost);
        if(dbUser.exp < claimCost) {
            callback("**" + user.username + "**, you don't have enough 🍅 Tomatoes to claim a card \n" 
                + "You need at least " + claimCost + ", but you have " + Math.floor(dbUser.exp));
            return;
        }

        let blockClaim = dbUser.dailystats && dbUser.dailystats.claim >= 30;
        if(blockClaim) {
            callback("**" + user.username + "**, you reached a limit of your daily claim. \n"
                + "It will be reset next time you successfully run `->daily`");
            return;
        }

        let any = false;
        try { any = (arg[0].trim() == 'any' || arg[0].trim() == 'all') } catch(e){}

        let collection = mongodb.collection('cards');
        let guild = guilds.filter(g => g.guild_id == guildID)[0];
        let find = {};
        if(guild && !any) find.collection = guild.collection;
        find = forge.getCardEffect(dbUser, 'claim', find)[0];

        collection.find(find).toArray((err, i) => {
            let res = _.sample(i);
            let file = getCardFile(res);
            let name = utils.toTitleCase(res.name.replace(/_/g, " "));

            let heroEffect = !heroes.getHeroEffect(dbUser, 'claim', true);
            nextClaim = heroes.getHeroEffect(dbUser, 'claim_akari', nextClaim);
            let phrase = "**" + user.username + "**, you got **" + name + "** \n";
            if(res.craft) 
                phrase += "This is a **craft card**. Find pair and `->forge` special card of them!\n";
            
            if(claimCost >= 500) phrase += "*You are claiming for extremely high price*\n";
            if(dbUser.cards && dbUser.cards.filter(
                c => c.name == res.name && c.collection == res.collection).length > 0)
                phrase += "(*you already own this card*)\n";
            phrase += "Your next claim will cost **" + nextClaim + "**🍅";

            stat.claim++;
            heroes.addXP(dbUser, .1);
            ucollection.update(
                { discord_id: user.id },
                {
                    $push: {cards: res },
                    $set: {dailystats: stat},
                    $inc: {exp: -claimCost}
                }
            ).then(() => {
                callback(phrase, file);
                quest.checkClaim(dbUser, (mes)=>{callback(mes)});
            });
        });
    });
}

function addXP(user, amount, callback) {
    if(cooldownList.includes(user.id)) return;
    if(amount > 5) amount = 5;

    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: user.id}).then((res) => {
        if(res) {
            let increment = res.hero? {exp: amount, 'hero.exp': amount * .01} : {exp: amount}
            amount = heroes.getHeroEffect(res, 'addXP', amount);
            collection.update( 
                { discord_id: user.id},
                {
                    $set: { username: user.username },
                    $inc: increment
                },
                { upsert: true }
            ).then((u)=>{
                quest.checkXP(res, (mes)=>{callback(mes)});
            });
        } else {
            collection.update( { discord_id: user.id},
                {
                    $set: { 
                        discord_id: user.id,
                        username: user.username,
                        cards: [],
                        exp: 300
                    },
                }, { upsert: true }
            );
        }
    });
    

    cooldownList.push(user.id);
    setTimeout(() => removeFromCooldown(user.id), 6000);
}

function removeFromCooldown(userID) {
    let i = cooldownList.indexOf(userID);
    cooldownList.splice(i, 1);
    //console.log("Removed user from cooldown");
}

function getXP(user, callback) {
    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: user.id }).then((u) => {
        if(u) {
            let stat = u.dailystats;
            if(!stat) stat = {summon:0, send: 0, claim: 0, quests: 0};

            let bal = u.exp;
            let stars = countCardLevels(u.cards);
            let claimCost = (stat.claim + 1) * 50;
            claimCost = heroes.getHeroEffect(u, 'claim_akari', claimCost);
            let msg = "**" + user.username + "**, you have **" + Math.floor(bal) + "** 🍅 Tomatoes ";
            msg += "and " + stars + " \u2B50 stars!\n";

            var blockClaim = heroes.getHeroEffect(u, 'claim', stat.claim >= 30);
            if(blockClaim) {
                msg += "You can't claim more cards, as you reached your daily claim limit.\n"
            } else {
                if(bal > claimCost) 
                    msg += "You can claim " + getClaimsAmount(stat.claim, bal) + " cards today! Use `->claim` \n";
                msg += "Your claim now costs " + claimCost + " 🍅 Tomatoes\n";
            }
            if(!u.hero && stars >= 50) msg += "You have enough \u2B50 stars to get a hero! use `->hero list`";
            callback(msg);
        } 
    });
}

function getQuests(user, callback) {
    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: user.id }).then((u) => {
        if(u) {
            if(!u.quests || u.quests.length <= 0){
                callback("**" + user.username + "**, you don't have any quests. \n"
                    + "New quests will appear after successfull '->daily' command");
                return;
            }

            let res = "**" + user.username + "**, your quests for today: \n";
            for(let i=0; i<u.quests.length; i++) {
                res += (i+1).toString() + ". " + u.quests[i].description;
                res += " [" + u.quests[i].award + "🍅] \n";
            }
            callback(res);
        }
    });
}

function getCards(userID, callback) {
    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: userID }).then((usr) => {
        if(!usr) return;

        let cards = usr.cards;
        if(cards && cards.length > 0){
            callback(cards);
        } else {
            callback(null);
        }
    });
}

function summon(user, card, callback) {
    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: user.id }).then(dbUser => {
        if(!dbUser) return;

        let check = card.toLowerCase().replace(/ /g, "_");
        if(!dbUser.cards){
            callback(user.username + ", you have no any cards");
            return;
        }

        let match = getBestCardSorted(dbUser.cards, check)[0];
        if(match){
            let stat = dbUser.dailystats;
            let name = utils.toTitleCase(match.name.replace(/_/g, " "));
            let file = getCardFile(match);
            callback("**" + user.username + "** summons **" + name + "!**", file);

            if(!stat) stat = {summon:0, send: 0, claim: 0, quests: 0};
            stat.summon++;

            heroes.addXP(dbUser, .1);
            collection.update(
                { discord_id: user.id }, {$set: {dailystats: stat}}
            ).then((e) => {
                quest.checkSummon(dbUser, (mes)=>{callback(mes)});
            });
        } else 
            callback("**" + user.username + "** you have no card named **'" + card + "'**");
    }).catch(e => logger.error(e));
}

function transfer(from, to, card, callback) {
    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: from.id }).then(dbUser => {
        if(!dbUser) return;

        let check = card.toLowerCase().replace(/ /g, "_");
        let cards = dbUser.cards;
        if(!cards){
            callback(from.username + ", you have no any cards");
            return;
        }

        if(from.id == to) {
            callback(from.username + ", did you actually think it would work?");
            return;
        }

        let match = getBestCardSorted(dbUser.cards, check)[0];
        
        if(match){
            let name = utils.toTitleCase(match.name.replace(/_/g, " "));
            let hours = 20 - utils.getHoursDifference(match.frozen);
            if(hours && hours > 0) {
                callback("**" + from.username + "**, the card **" 
                    + name + "** is frozen for **" 
                    + hours + "** more hours! You can't transfer it");
                return;
            }

            collection.findOne({ discord_id: to }).then(u2 => {
                if(!u2) return;

                let stat = dbUser.dailystats;
                let i = cards.indexOf(match);
                cards.splice(i, 1);

                if(!stat) stat = {summon: 0, send: 0, claim: 0};
                stat.send++;

                var fromExp = dbUser.exp;
                fromExp = heroes.getHeroEffect(dbUser, 'send', fromExp, match.level);
                if(fromExp > dbUser.exp) 
                    callback("**Akari** grants **" + Math.round(fromExp - dbUser.exp) 
                        + "** tomatoes to **" + dbUser.username 
                        + "** for sending a card!");

                heroes.addXP(dbUser, .1);
                collection.update(
                    { discord_id: from.id }, 
                    { $set: {cards: cards, dailystats: stat, exp: fromExp}}
                ).then(() => {
                    quest.checkSend(dbUser, match.level, (mes)=>{callback(mes)});
                });

                match.frozen = new Date();
                collection.update(
                    { discord_id: to },
                    { $push: {cards: match }}
                ).then(() => {
                    forge.getCardEffect(dbUser, 'send', u2, callback);
                });

                callback("**" + from.username + "** sent **" + name + "** to **" + u2.username + "**");
            });
            return;
        }
        callback("**" + from.username + "** you have no card named **'" + card + "'**");
    });
}

function pay(from, to, amount, callback) {
    let collection = mongodb.collection('users');
    amount = Math.abs(amount);
    collection.find({ discord_id: from }).toArray((err, u) => {
        if(u.length == 0) return;

        if(u[0].exp >= amount) {
            collection.find({ discord_id: to }).toArray((err, u2) => {
                if(u2.length == 0) return;
                collection.update({ discord_id: from }, {$inc: {exp: -amount }});
                collection.update({ discord_id: to }, {$inc: {exp: amount }});
                callback("**" + u[0].username + "** sent **" + amount + "** 🍅 Tomatoes to **" + u2[0].username + "**");
            });
            return;
        }
        callback("**" + u[0].username + "**, you don't have enough funds");
    });
}

function sell(user, card, callback) {
    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: user.id }).then(dbUser => {
        if(!dbUser) return;

        let check = card.toLowerCase().replace(/ /g, "_");
        let cards = dbUser.cards;
        if(!cards){
            callback(user.username + ", you have no any cards");
            return;
        }

        let match = getBestCardSorted(dbUser.cards, check)[0];
        if(match) {
            heroes.addXP(dbUser, .1);
            let exp = forge.getCardEffect(dbUser, 'sell', settings.cardprice[match.level - 1])[0];
            cards.splice(cards.indexOf(match), 1);
            collection.update(
                { discord_id: user.id },
                {
                    $set: {cards: cards },
                    $inc: {exp: exp}
                }
            );

            let name = utils.toTitleCase(match.name.replace(/_/g, " "));
            callback("**" + user.username + "** sold **" + name + "** for **" + exp + "** 🍅 Tomatoes");
        } else
            callback("**" + user.username + "**, you have no card named **'" + card + "'**");
    });
}

function daily(uID, callback) {
    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: uID }).then((user) => {
        if(!user) return;

        var stars = countCardLevels(user.cards);
        let amount = 100;
        
        if(user.dailystats && user.dailystats.claim) 
            amount = Math.max(heroes.getHeroEffect(user, 'daily', user.dailystats.claim), 100);

        let cardEffect = forge.getCardEffect(user, 'daily', amount, 20);
        amount = cardEffect[0];
        
        if(stars < 35) amount += 200;
        heroes.addXP(user, 1);
        let hours = cardEffect[1] - utils.getHoursDifference(user.lastdaily);
        if(!hours || hours <= 0) {
            collection.update(
                { discord_id: uID },
                {
                    $set: {lastdaily: new Date(), quests: quest.getRandomQuests()},
                    $unset: {dailystats: ""},
                    $inc: {exp: amount}
                }
            );
        } else {
            if(hours == 1){
                let mins = 60 - (utils.getMinutesDifference(user.lastdaily) % 60);
                callback("**" + user.username + "**, you can claim daily 🍅 in **" + mins + " minutes**");
            } else 
                callback("**" + user.username + "**, you can claim daily 🍅 in **" + hours + " hours**");
            return;
        }

        var msg = "**" + user.username + "** recieved daily **" + amount + "** 🍅 You now have " 
        + (Math.floor(user.exp) + amount) + "🍅 \n";

        if(stars < 35) msg += "(you got extra 200🍅 as a new player bonus)\n";
        msg += "You also got **2 daily quests**. To view them use `->quests`\n";
        
        if(!user.hero && stars >= 50) 
            msg += "You have enough stars to get a hero! use `->hero list`";
        callback(msg);
    });
}

function leaderboard_new(arg, guild, callback) {
    let global = arg == 'global';
    let collection = mongodb.collection('users');
    collection.find({}).toArray((err, users) => {
        let usrLevels = [];
        users.forEach(function(element) {
            if(element.cards) {
                let lvl = countCardLevels(element.cards);
                lvl = heroes.getHeroEffect(element, 'rating', lvl);
                usrLevels.push({
                    id: element.discord_id,
                    name: element.username,
                    levels: lvl
                });
            }
        }, this);

        usrLevels.sort(dynamicSort('-levels'));
        if(global) {
            callback("**Global TOP5 Card Owners:**\n" + nameOwners(usrLevels));
        } else if(guild) {
            let includedUsers = [];
            try {
                usrLevels.forEach((elem) => {
                    guild.members.forEach((mem) => {
                        if(mem.user.id == elem.id) {
                            includedUsers.push(elem);
                        }
                        if(includedUsers.length >= 5) throw BreakException;
                    }, this);
                }, this);
            } catch(e) {}

            if(includedUsers.length > 0) {
                callback("**Local TOP5 Card Owners:**\n" + nameOwners(includedUsers));
            }
        }
    });
}

function award(uID, amout, callback) {
    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: uID }).then((user) => {
        collection.update(
            { discord_id: uID },
            {
                $inc: {exp: amout}
            }
        );
        callback("**" + user.username + "** just got **" + amout + "** 🍅 Tomatoes for free!");
    });
    
}

function difference(discUser, targetID, args, callback) {
    let collection = mongodb.collection('users');
    let uID = discUser.id;
    collection.findOne({ discord_id: uID }).then((user) => {
        if(!user) return;

        if(uID == targetID) {
            callback("Eh? That won't work");
            return;
        }

        collection.findOne({ discord_id: targetID }).then((user2) => {
            if(!user2) return;

            let dif = user2.cards.filter(x => user.cards.filter(y => x.name == y.name) == 0);
            let cards = [];
            dif.forEach(element => {
                cards.push(element);
            }, this);
            
            if(cards.length > 0) 
                callback(listing.addNew(discUser, args, cards, user2.username));
            else
                callback("**" + user2.username + "** has no any unique cards for you\n");
        });
    });
}

function getUserName(uID, callback) {
    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: uID }).then((user) => {
        if(!user) return;
        callback(user.username);
    });
}

function removeCard(target, collection) {
    for(let i=0; i<collection.length; i++) {
        if(collection[i].name == target.name) {
            collection.splice(i, 1);
            return collection;
        }
    }
}

function doesUserHave(name, tgID, card, callback) {
    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: tgID }).then((user) => {
        if(!user) return;
        
        let match = getBestCardSorted(user.cards, card)[0];
        if(match) {
            let cardname = utils.toTitleCase(match.name.replace(/_/g, " "));
            callback("**" + name + "**, matched card **" + cardname + "**");
        }
        else callback("**" + name + "**, card with that name was not found");
    });
}

function nameOwners(col) {
    let res = '';
    for(let i=0; i<col.length; i++) {
        res += (i+1).toString() + ". ";
        res += "**" + col[i].name + "**";
        res += " (" + col[i].levels + " stars)\n";
        if(i >= 4) break;
    }
    return res;
}

function dynamicSort(property) {
    var sortOrder = 1;
    if(property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }
    return function (a,b) {
        var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
        return result * sortOrder;
    }
}

function getClaimsAmount(claims, exp) {
    let res = 0;
    let total = claims * 50;
    let allowed = 30 - claims;

    claims++;
    while(exp >= total) {
        claims++;
        res++;
        total += claims * 50;
    }

    return Math.min(res, allowed);
}

function countCardLevels(cards) {
    let sum = 0;
    let metCards = [];
    if(!cards) return 0;
    cards.forEach(function(element) {
        if(!metCards.includes(element.name)) {
            sum += element.level;
            metCards.push(element.name);
        }
    }, this);
    return sum;
}

function fixUserCards() {
    let newUsers = []
    let collection = mongodb.collection('users');
    collection.find({}).toArray((err, users) => {
        users.forEach(function(u) {
            if(u.cards) {
                u.cards.forEach(function(elem) {
                    elem.level = parseInt(elem.level);
                }, this);
            }
            newUsers.push(u);

            collection.remove({ _id: u._id }).then(()=>{
                collection.insertOne(u);
            });
        }, this);
    });
}

function getBestCardSorted(cards, name) {
    let filtered = cards.filter(c => c.name.toLowerCase().includes(name.replace(' ', '_')));
    filtered.sort((a, b) => {
        let dist1 = lev(a, name);
        let dist2 = lev(b, name);
        if(dist1 < dist2) return 1;
        if(dist1 > dist2) return -1;
        else return 0;
    });

    var re = new RegExp('^' + name);
    let supermatch = filtered.filter(c => re.exec(c.name.toLowerCase()));
    if(supermatch.length > 0) { 
        let left = filtered.filter(c => !supermatch.includes(c));
        return supermatch.concat(left);
    }
    return filtered;
}

function getCardFile(card) {
    let name = utils.toTitleCase(card.name.replace(/_/g, " "));
    let ext = card.animated? '.gif' : (card.compressed? '.jpg' : '.png');
    let prefix = card.craft? card.level + 'cr' : card.level;
    return './cards/' + card.collection + '/' + prefix + "_" + card.name + ext;
}

function getDefaultChannel(guild, clientUser) {
    return guild.channels
        .filter(c => c.permissionsFor(clientUser).has('SEND_MESSAGES'))
        .array().find(c => c.type == 'text');
}

function isAdmin(sender) {
    return settings.admins.includes(sender);
}

module.exports = {
    connect, disconnect, claim, addXP, getXP, doesUserHave,
    getCards, summon, transfer, sell, award, getUserName,
    pay, daily, getQuests, getBestCardSorted,
    leaderboard_new, difference, dynamicSort, countCardLevels, 
    getCardFile, getDefaultChannel, isAdmin, needsCards
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
const promotions = require('../settings/promotions.json');
const utils = require('./localutils.js');
const listing = require('./reactions.js');
const cardmanager = require('./cardmanager.js');
const forge = require('./forge.js');
const inv = require('./inventory.js');
const stats = require('./stats.js');
const invite = require('./invite.js');
const helpMod = require('./help.js');
const lev = require('js-levenshtein');

var collections = [];
fs.readdir('./cards', (err, items) => {
    if(err) console.log(err);
    collections = items;
});

function disconnect() {
    isConnected = false;
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
        helpMod.connect(db);

        if(callback) callback();   
    });
}

function claim(user, guildID, arg, callback) {
    let ucollection = mongodb.collection('users');
    ucollection.findOne({ discord_id: user.id }).then((dbUser) => {
        if(!dbUser) return;

        let any = false;
        let promo = false;
        let amount = 1;
        try { 
            arg.forEach(e => {
                if(utils.isInt(e)) amount = parseInt(e);
                else {
                    any = e == 'any';
                    promo = e == 'promo';
                }
            }, this);
        } catch(exc){}

        if(promo) {
            claimPromotion(user, dbUser, callback);
            return;
        }

        amount = Math.min(Math.max(parseInt(amount), 1), 30);

        if(!dbUser.dailystats) dbUser.dailystats = {summon:0, send: 0, claim: 0, quests: 0};

        let claimCost = getClaimsCost(dbUser, amount);
        let nextClaim = 50 * (dbUser.dailystats.claim + amount + 1);
        if(dbUser.exp < claimCost) {
            callback("**" + user.username + "**, you don't have enough 🍅 Tomatoes "
                + ((amount == 1)? "to claim a card" : "to claim **" + amount + "** cards")
                + "\nYou need at least **" + claimCost + "**, but you have **" + Math.floor(dbUser.exp) + "**");
            return;
        }

        let blockClaim = dbUser.dailystats && dbUser.dailystats.claim >= 30;
        if(blockClaim) {
            callback("**" + user.username + "**, you reached a limit of your daily claim. \n"
                + "It will be reset next time you successfully run `->daily`");
            return;
        }

        let collection = mongodb.collection('cards');
        let guild = guilds.filter(g => g.guild_id == guildID)[0];
        let query = [ 
            { $match: { } },
            { $sample: { size: amount } } 
        ]

        if(guild && !any) query[0].$match.collection = guild.collection;

        collection.aggregate([ 
            { $match: { level : 3 } },
            { $sample: { size: 1 } } 
        ]).toArray((err, extra) => {
            collection.aggregate(query).toArray((err, res) => {
                let phrase = "**" + user.username + "**, you got";
                nextClaim = heroes.getHeroEffect(dbUser, 'claim_akari', nextClaim);

                if(forge.getCardEffect(dbUser, 'claim', false)[0]) {
                    res.shift();
                    res.push(extra[0]);
                } 

                res.sort(dynamicSort('-level'));

                if(amount == 1) {
                    let names = [];
                    phrase += " **" + utils.toTitleCase(res[0].name.replace(/_/g, " ")) + "**\n";
                    if(res[0].craft) phrase += "This is a **craft card**. Find pair and `->forge` special card of them!\n";
                    if(dbUser.cards && dbUser.cards.filter(
                        c => c.name == res[0].name && c.collection == res[0].collection).length > 0)
                        phrase += "(*you already have this card*)\n";
                } else {
                    phrase += " (new cards are bold):\n"
                    for (var i = 0; i < res.length; i++) {
                        if(dbUser.cards 
                            && dbUser.cards.filter(c => c.name == res[i].name && c.collection == res[i].collection).length > 0)
                            phrase += (i + 1) + ". " + listing.nameCard(res[i], 1);
                        else phrase += (i + 1) + ". **" + listing.nameCard(res[i], 1) + "**";
                        phrase += "\n";
                    }
                    phrase += "\nUse `->sum [card name]` to summon a card\n";
                }

                //if(claimCost >= 500) phrase += "*You are claiming for extremely high price*\n";            
                phrase += "Your next claim will cost **" + nextClaim + "**🍅";

                let incr = {exp: -claimCost};
                if(promotions.current > -1) {
                    let prm = promotions.list[promotions.current];
                    let addedpromo = Math.floor(claimCost / 2);
                    incr = {exp: -claimCost, promoexp: addedpromo};
                    phrase += "\n You got additional **" + addedpromo + "** " + prm.currency;
                }

                dbUser.dailystats.claim += amount;
                heroes.addXP(dbUser, .2 * amount);
                ucollection.update(
                    { discord_id: user.id },
                    {
                        $pushAll: {cards: res },
                        $set: {dailystats: dbUser.dailystats},
                        $inc: incr
                    }
                ).then(() => {
                    callback(phrase, ((amount == 1)? getCardFile(res[0]) : null));
                    quest.checkClaim(dbUser, callback);
                }).catch(e => console.log(e));
            });
        });
    });
}

function claimPromotion(user, dbUser, callback) {
    let claimCost = 100;
    let ucollection = mongodb.collection('users');

    if(dbUser.dailystats) claimCost += 20 * dbUser.dailystats.claim;

    if(promotions.current == -1) {
        callback("**" + user.username + "**, there are no any promotional cards available now");
        return;
    }

    let promo = promotions.list[promotions.current];
    if(!dbUser.promoexp){
        callback("**" + user.username + "**, you have to earn some " + promo.currency + " first.\n"
            + "To earn them claim cards or complete quests");
        return;
    }
    
    if(dbUser.promoexp < claimCost) {
        callback("**" + user.username + "**, you don't have enough " + promo.currency + " to claim a card \n" 
            + "You need at least " + claimCost + ", but you have " + Math.floor(dbUser.promoexp));
        return;
    }
    
    let collection = mongodb.collection('promocards');
    let find = {collection: promo.name};

    collection.find(find).toArray((err, i) => {
        let res = _.sample(i);
        let file = getCardFile(res);
        let name = utils.toTitleCase(res.name.replace(/_/g, " "));

        let phrase = "**" + user.username + "**, you got **" + name + "** \n";        
        if(dbUser.cards && dbUser.cards.filter(
            c => c.name == res.name && c.collection == res.collection).length > 0)
            phrase += "(*you already have this card*)\n";
        phrase += "You have now **" + (dbUser.promoexp - claimCost) + "** " + promo.currency;

        heroes.addXP(dbUser, .15);
        ucollection.update(
            { discord_id: user.id },
            {
                $push: {cards: res },
                $inc: {promoexp: -claimCost}
            }
        ).then(() => {
            callback(phrase, file);
        });
    });
}

function addXP(user, amount, callback) {
    if(cooldownList.includes(user.id)) return;
    if(amount > 5) amount = 5;

    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: user.id}).then((res) => {
        if(res) {
            //let increment = res.hero? {exp: amount, 'hero.exp': amount * .01} : 
            amount = heroes.getHeroEffect(res, 'addXP', amount);
            collection.update( 
                { discord_id: user.id},
                {
                    $set: { username: user.username },
                    $inc: {exp: amount}
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
    

    //cooldownList.push(user.id);
    //setTimeout(() => removeFromCooldown(user.id), 6000);
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
            if(!u.dailystats) u.dailystats = {summon:0, send: 0, claim: 0, quests: 0};

            let bal = u.exp;
            let stars = countCardLevels(u.cards);
            let claimCost = (u.dailystats.claim + 1) * 50;
            claimCost = heroes.getHeroEffect(u, 'claim_akari', claimCost);
            let msg = [];
            msg.push("**" + user.username + "**, you have **" + Math.floor(bal) + "** 🍅 Tomatoes "
                + "and " + stars + " \u2B50 stars!");

            var blockClaim = heroes.getHeroEffect(u, 'claim', u.dailystats.claim >= 30);
            if(blockClaim) {
                msg.push("You can't claim more cards, as you reached your daily claim limit.")
            } else {
                if(bal > claimCost) 
                    msg.push("You can claim " + getClaimsAmount(u, u.dailystats.claim, bal) + " cards today! Use `->claim [amount]`");
                msg.push("Your claim now costs " + claimCost + " 🍅 Tomatoes");
            }
            if(!u.hero && stars >= 50) msg.push("You have enough \u2B50 stars to get a hero! use `->hero list`");

            if(promotions.current > -1 && u.promoexp) {
                let promo = promotions.list[promotions.current];
                msg.push("A special promotion is now going until **" + promo.ends + "**!");
                msg.push("You have **" + u.promoexp + "** " + promo.currency);
                msg.push("Use `->claim promo` to get special limited time cards");
            }
   
            callback(msg.join("\n"));
        } 
    });
}

function getQuests(user, callback) {
    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: user.id }).then((u) => {
        if(u) {
            let res = "**" + user.username + "**";
            if(!u.quests || u.quests.length <= 0){
                res += ", you don't have any quests. \n"
                    + "New quests will appear after successfull '->daily' command";
            } else {

                res += ", your quests for today: \n";
                for(let i=0; i<u.quests.length; i++) {
                    res += (i+1).toString() + ". " + u.quests[i].description;
                    res += " [" + u.quests[i].award + "🍅] \n";
                }
            }

            /*if(promotions.current > -1) {
                let promo = promotions.list[promotions.current];
                let active = promo.quests.filter(q => !u.dailystats.promoquests.includes(q.name));
                res += "\nAdditional limited time quests:\n";
            }*/
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

// function summon(user, card, callback) {
//     let collection = mongodb.collection('users');
//     collection.findOne({ discord_id: user.id }).then(dbUser => {
//         if(!dbUser) return;

//         let check = card.toLowerCase().replace(/ /g, "_");
//         if(!dbUser.cards){
//             callback(user.username + ", you have no any cards");
//             return;
//         }

//         let match = getBestCardSorted(dbUser.cards, check)[0];
//         if(match){
//             let name = utils.toTitleCase(match.name.replace(/_/g, " "));
//             let file = getCardFile(match);
//             callback("**" + user.username + "** summons **" + name + "!**", file);

//             if(!dbUser.dailystats) dbUser.dailystats = {summon:0, send: 0, claim: 0, quests: 0};
//             dbUser.dailystats.summon++;

//             heroes.addXP(dbUser, .1);
//             collection.update(
//                 { discord_id: user.id }, {$set: {dailystats: dbUser.dailystats}}
//             ).then((e) => {
//                 quest.checkSummon(dbUser, (mes)=>{callback(mes)});
//             });
//         } else 
//             callback("**" + user.username + "** you have no card named **'" + card + "'**");
//     }).catch(e => logger.error(e));
// }

function summon(user, args, callback) {
    if(!args) return callback("**" + user.username + "**, please specify name/collection/level");
    let query = utils.getRequestFromFilters(args);
    getUserCards(user, query).toArray((err, objects) => {
        let cards = objects[0].cards;
        let match = query.name? getBestCardSorted(cards, query.name)[0] : cards[0];
        if(!match) return callback("**" + user.username + "**, can't find card matching that request");

        callback("**" + user.username + "** summons **" + utils.toTitleCase(match.name.replace(/_/g, " ")) + "!**", getCardFile(match));

        /*if(!dbUser.dailystats) dbUser.dailystats = {summon:0, send: 0, claim: 0, quests: 0};
        dbUser.dailystats.summon++;

        collection.update(
            { discord_id: user.id }, {$set: {dailystats: dbUser.dailystats}}
        ).then((e) => {
            quest.checkSummon(dbUser, (mes)=>{callback(mes)});
        });*/
    });
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

        if(!utils.canSend(dbUser)) {
            callback(utils.formatError(from.username, 
                "Can't send card!",
                "you can't send more cards. Please, trade fare and consider **getting** more cards from users. Details: `->help trade`"));
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

                if(!utils.canGet(dbUser)) {
                    callback(utils.formatError(from.username, 
                        "Can't send card!",
                        "user **" + u2.username + "** got too many cards. That user has to **send** more cards. Details: `->help trade`"));
                    return;
                }

                let i = cards.indexOf(match);
                cards.splice(i, 1);

                if(!dbUser.dailystats) dbUser.dailystats = {summon: 0, send: 0, claim: 0};
                dbUser.dailystats.send++;

                var fromExp = dbUser.exp;
                fromExp = heroes.getHeroEffect(dbUser, 'send', fromExp, match.level);
                if(fromExp > dbUser.exp) 
                    callback("**Akari** grants **" + Math.round(fromExp - dbUser.exp) 
                        + "** tomatoes to **" + dbUser.username 
                        + "** for sending a card!");

                heroes.addXP(dbUser, .1);
                collection.update(
                    { discord_id: from.id }, 
                    { 
                        $set: { cards: cards, dailystats: dbUser.dailystats, exp: fromExp },
                        $inc: { sends: match.level }
                    }
                ).then(() => {
                    quest.checkSend(dbUser, match.level, (mes)=>{callback(mes)});
                });

                match.frozen = new Date();
                collection.update(
                    { discord_id: to },
                    { 
                        $push: { cards: match },
                        $inc: { gets: match.level }
                    }
                ).then(() => {
                    forge.getCardEffect(dbUser, 'send', u2, callback);
                });

                callback(utils.formatConfirm(from, "Sent successfully", "you sent **" + name + "** to **" + u2.username + "**"));
            });
            return;
        }
        callback(utils.formatError(from, "Can't send card", "you have no card matching **'" + card + "'**"));
    });
}

function pay(from, to, amount, callback) {
    let collection = mongodb.collection('users');
    amount = Math.abs(amount);
    collection.findOne({ discord_id: from }).then(dbUser => {
        if(!dbUser) return;

        if(from == to) {
            callback("Did you actually think it would work?");
            return;
        }

        if(dbUser.exp >= amount) {
            collection.findOne({ discord_id: to }).then(user2 => {
                if(!user2) return;

                collection.update({ discord_id: from }, {$inc: {exp: -amount, sends: Math.floor(amount/100) }});
                collection.update({ discord_id: to }, {$inc: {exp: amount, gets: Math.floor(amount/100) }});
                callback(utils.formatConfirm(dbUser, "Tomatoes sent", "you sent **" + amount + "**🍅 to **" + user2.username + "**"));
            });
            return;
        }
        callback(utils.formatError(dbUser.username, "Can't send Tomatoes", "you don't have enough funds"));
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
        console.log(utils.getHoursDifference(user.lastdaily));
        let hours = cardEffect[1] - utils.getHoursDifference(user.lastdaily);           
        if(hours && hours > 0) {
            if(hours == 1){
                let mins = 60 - (utils.getMinutesDifference(user.lastdaily) % 60);
                callback("**" + user.username + "**, you can claim daily 🍅 in **" + mins + " minutes**");
            } else 
                callback("**" + user.username + "**, you can claim daily 🍅 in **" + hours + " hours**");
            return;
        }

        heroes.addXP(user, 2);

        var msg = "**" + user.username + "** recieved daily **" + amount + "** 🍅 You now have " 
        + (Math.floor(user.exp) + amount) + "🍅 \n";

        if(stars < 35) msg += "(you got extra 200🍅 as a new player bonus)\n";
        msg += "You also got **2 daily quests**. To view them use `->quests`\n";
        
        if(!user.hero && stars >= 50) 
            msg += "You have enough stars to get a hero! use `->hero list`\n";

        let incr = {exp: amount};
        if(promotions.current > -1) {
            let promo = promotions.list[promotions.current];
            let tgexp = (user.dailystats? user.dailystats.claim * 80 : 0) + 100;
            incr = {exp: amount, promoexp: tgexp};
            msg += "A special promotion is now going until **" + promo.ends + "**!\n"
                + "You got **" + tgexp + "** " + promo.currency + "\n"
                + "Use `->claim promo` to get special limited time cards";
        }

        collection.update(
            { discord_id: uID }, {
                $set: {lastdaily: new Date(), quests: quest.getRandomQuests()},
                $unset: {dailystats: ""},
                $inc: incr
            }
        );

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
                //lvl = heroes.getHeroEffect(element, 'rating', lvl);
                usrLevels.push({
                    id: element.discord_id,
                    name: element.username,
                    levels: lvl
                });
            }
        }, this);

        usrLevels.sort(dynamicSort('-levels'));
        if(global) {
            callback("**Global TOP Card Owners:**\n" + nameOwners(usrLevels));
        } else if(guild) {
            let includedUsers = [];
            try {
                usrLevels.forEach((elem) => {
                    guild.members.forEach((mem) => {
                        if(mem.user.id == elem.id) {
                            includedUsers.push(elem);
                        }
                        if(includedUsers.length >= 10) throw BreakException;
                    }, this);
                }, this);
            } catch(e) {}

            if(includedUsers.length > 0) {
                callback("**Local TOP Card Owners:**\n" + nameOwners(includedUsers));
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
            if(dif.length > 0) 
                callback(listing.addNew(discUser, args, dif, user2.username));
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

function needsCards(discUser, args, callback) {
    let term = args.join('_');
    let collection = mongodb.collection('users');
    let ccollection = term.startsWith('-h')? 
        mongodb.collection('promocards') : mongodb.collection('cards');
    
    //let isCol = term[0] == '-';
    //let match = {'name':new RegExp(term, 'i')};
    //if(isCol) match = {'collection':new RegExp(term.replace('-', ''), 'i')};

    collection.findOne({"discord_id":discUser.id}).then(user => {
        if(!user) return;

        ccollection.find().toArray((err, res) => {
            let dif = res.filter(x => user.cards.filter(y => 
                (x.name == y.name && x.collection == y.collection)) == 0);
            
            if(dif.length > 0) 
                callback(listing.addNew(discUser, args, dif, 'Database'));
            else
                callback("**Database** has no any unique cards for you\n");
        });
    });
}

function getUserCards(user, query) {
    return mongodb.collection('users').aggregate([
        {"$match":{"discord_id":user.id}},
        {"$unwind":"$cards"},
        {"$match":query},
        {"$group": {_id: 0, cards: {"$push": "$cards"}}},
        {"$project": {cards: '$cards', _id: 0}}
    ]);
}

function nameOwners(col) {
    let res = '';
    for(let i=0; i<col.length; i++) {
        res += (i+1).toString() + ". ";
        res += "**" + col[i].name + "**";
        res += " (" + col[i].levels + " stars)\n";
        if(i >= 9) break;
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

function getClaimsAmount(dbUser, claims, exp) {
    let res = 0;
    let total = claims * 50;
    let allowed = 30 - claims;

    claims++;
    while(exp >= total) {
        claims++;
        res++;
        total += heroes.getHeroEffect(dbUser, 'claim_akari', claims * 50);
    }

    return Math.min(res, allowed);
}

function getClaimsCost(dbUser, amount) {
    let total = 0;
    let claims = dbUser.dailystats.claim;
    for (var i = 0; i < amount; i++) {
        claims++;
        total += heroes.getHeroEffect(dbUser, 'claim_akari', claims * 50);
    }
    return total;
}

function countCardLevels(cards) {
    let sum = 0;
    let metCards = [];
    if(!cards) return 0;
    cards.forEach(e => {
        if(metCards.filter(m => {
            return m.name == e.name && 
            m.collection == e.collection}).length == 0) {
            sum += e.level;
            metCards.push({
                name: e.name, 
                collection: e.collection
            });
        }
    }, this);
    return sum;
}

function getBestCardSorted(cards, name) {
    let filtered = cards.filter(c => c.name.toLowerCase().includes(name.replace(' ', '_')));
    filtered.sort((a, b) => {
        let dist1 = lev(a.name, name);
        let dist2 = lev(b.name, name);
        if(dist1 < dist2) return -1;
        if(dist1 > dist2) return 1;
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
    let col = collections.filter(c => c.includes(card.collection))[0];
    return './cards/' + col + '/' + prefix + "_" + card.name + ext;
}

function getDefaultChannel(guild, clientUser) {
    return guild.channels
        .filter(c => c.permissionsFor(clientUser).has('SEND_MESSAGES'))
        .array().find(c => c.type == 'text');
}

function isAdmin(sender) {
    return settings.admins.includes(sender);
}

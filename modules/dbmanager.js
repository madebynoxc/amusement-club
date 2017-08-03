module.exports = {
    connect, disconnect, claim, addXP, getXP, 
    getCards, summon, transfer, sell, award, 
    pay, daily, leaderboard
}

var MongoClient = require('mongodb').MongoClient;
var mongodb;
var isConnected = false;
var cooldownList = [];

const fs = require('fs');
const assert = require('assert');
const logger = require('./log.js');
const _ = require("lodash");
const randomColor = require('randomcolor');
const settings = require('../settings/general.json');

function disconnect() {
    isConnected = false;
    media.clearTemp();
    mongodb.close();
}

function connect(callback) {
    MongoClient.connect(settings.database, function(err, db) {
        assert.equal(null, err);
        mongodb = db;
        isConnected = true;
        logger.message("Connected correctly to database");   
        if(callback) callback();   

        logger.message("Updating cards..."); 
        scanCards();
    });
}

function scanCards() {
    let collection = mongodb.collection('cards');
    collection.find({}).toArray((err, res) => {

        fs.readdir('./cards', function(err2, items) {
            items.forEach(item => {
                let newCards = [];
                let path = './cards/' + item;

                let files = fs.readdirSync(path);
                for (let i in files) {
                    let name = files[i].split('.')[0];
                    
                    if (res.filter((e) => e.name == name.substr(2)).length == 0) {
                        newCards.push(name);
                    }
                }

                if(newCards.length != 0)
                    insertCards(newCards, item);
                else 
                    console.log(item + " update not needed");
            });
        });
    });
}

function insertCards(names, collection) {
    let cards = [];

    for (let i in names) {
        let c = {
            "name": names[i].substr(2),
            "collection": collection,
            "level": names[i][0]
        }
        cards.push(c);
    }

    var collection = mongodb.collection('cards');
    collection.insert(cards, (err, res) => {
        console.log("Inserted " + cards.length + " new cards to DB");
    });
    console.log(collection + " update finished");
}

function claim(user, callback) {
    let ucollection = mongodb.collection('users');
    ucollection.find({ discord_id: user.id }).toArray((err, result) => {

        if(result.length == 0 || result[0].exp < 100) {
            callback("**" + user.username + "**, you don't have enough 🍅 Tomatoes to claim a card");
            return;
        }

        let collection = mongodb.collection('cards');
        collection.find({}).toArray((err, i) => {
            let res = _.sample(i);
            let name = toTitleCase(res.name.replace(/_/g, " "));
            let file = './cards/' + res.collection + '/' + res.level + "_" + res.name + '.png';
            console.log(file);
            callback("Congratulations! You got " + name, file);

            ucollection.update(
                { discord_id: user.id },
                {
                    $push: {cards: res },
                    $inc: {exp: -100},
                }
            );
        });
    });
}

function addXP(user, amount) {
    if(cooldownList.includes(user.id)) return;

    if(amount > 8) amount = 8;

    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: user.id}).then((res) => {
        if(res) {
            collection.update( 
                { discord_id: user.id},
                {$inc: {exp: amount}},
                { upsert: true }
            );
        } else {
            collection.update( { discord_id: user.id},
                {
                    $set: { 
                        discord_id: user.id,
                        username: user.username,
                        exp: 300
                    },
                }, { upsert: true }
            );
        }
    });
    

    cooldownList.push(user.id);
    setTimeout(() => removeFromCooldown(user.id), 5000);
}

function removeFromCooldown(userID) {
    let i = cooldownList.indexOf(userID);
    cooldownList.splice(i, 1);
    console.log("Removed user from cooldown");
}

function getXP(user, callback) {
    let collection = mongodb.collection('users');
    collection.find({ discord_id: user.id }).toArray((err, i) => {
        if(i.length > 0) callback(i[0].exp);
    });
}

function getCards(user, callback) {
    let collection = mongodb.collection('users');
    collection.find({ discord_id: user }).toArray((err, i) => {
        if(i.length == 0) return;

        let usr = i[0]; 
        let cards = usr.cards;
        if(cards && cards.length > 0){ 
            let resp = "**" + usr.username + " has:** \n";
            resp += countDuplicates(cards);
            callback(resp);
        } else {
            callback("**" + usr.username + "** has no any cards");
        }
    });
}

function summon(user, card, callback) {
    let collection = mongodb.collection('users');
    collection.find({ discord_id: user.id }).toArray((err, u) => {
        if(u.length == 0) return;

        let check = card.toLowerCase().replace(/ /g, "_");
        let cards = u[0].cards;
        if(cards == undefined){
            callback(user.username + ", you have no any cards");
            return;
        }

        for(var i = 0; i < cards.length; i++) {
            if (cards[i].name.includes(check)) {
                let name = toTitleCase(cards[i].name.replace(/_/g, " "));
                let file = './cards/' + cards[i].collection + '/' + + cards[i].level + "_" + cards[i].name + '.png';
                callback("**" + user.username + "** summons **" + name + "!**", file);
                return;
            }
        }
        callback("**" + user.username + "** you have no card named **'" + card + "'**");
    });
}

function transfer(from, to, card, callback) {
    let collection = mongodb.collection('users');
    collection.find({ discord_id: from.id }).toArray((err, u) => {
        if(u.length == 0) return;

        let check = card.toLowerCase().replace(/ /g, "_");
        let cards = u[0].cards;
        if(cards == undefined){
            callback(from.username + ", you have no any cards");
            return;
        }

        for(var i = 0; i < cards.length; i++) {
            if (cards[i].name.includes(check)) {
                collection.find({ discord_id: to }).toArray((err, u2) => {
                    if(u2.length == 0) return;

                    let tg = cards[i];
                    cards.splice(i, 1);
                    collection.update(
                        { discord_id: from.id },
                        {
                            $set: {cards: cards }
                        }
                    );
                    collection.update(
                        { discord_id: to },
                        {
                            $push: {cards: tg }
                        }
                    );

                    let name = toTitleCase(tg.name.replace(/_/g, " "));
                    callback("**" + from.username + "** sent **" + name + "** to **" + u2[0].username + "**");
                });
                return;
            }
        }
        callback("**" + from.username + "** you have no card named **'" + card + "'**");
    });
}

function pay(from, to, amount, callback) {
    let collection = mongodb.collection('users');
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
    collection.find({ discord_id: user.id }).toArray((err, u) => {
        if(u.length == 0) return;

        let check = card.toLowerCase().replace(/ /g, "_");
        let cards = u[0].cards;
        if(cards == undefined){
            callback(user.username + ", you have no any cards");
            return;
        }

        for(var i = 0; i < cards.length; i++) {
            if (cards[i].name.includes(check)) {
                let exp = settings.cardprice[cards[i].level - 1];
                let tg = cards[i];
                cards.splice(i, 1);
                collection.update(
                    { discord_id: user.id },
                    {
                        $set: {cards: cards },
                        $inc: {exp: exp}
                    }
                );

                let name = toTitleCase(tg.name.replace(/_/g, " "));
                callback("**" + user.username + "** sold **" + name + "** for **" + exp + "** 🍅 Tomatoes");
                return;
            }
        }
        callback("**" + user.username + "** you have no card named **'" + card + "'**");
    });
}

function daily(uID, callback) {
    let collection = mongodb.collection('users');
    collection.findOne({ discord_id: uID }).then((user) => {
        if(!user) return;

        let mil = new Date() - user.lastdaily;
        let hours = 20 - Math.floor(mil / (1000*60*60));
        if(!hours || hours <= 0) {
            collection.update(
                { discord_id: uID },
                {
                    $set: {lastdaily: new Date()},
                    $inc: {exp: 100}
                }
            );
        } else {
            callback("**" + user.username + "**, you can claim daily 🍅 in **" + hours + " hours**");
            return;
        }
        callback("**" + user.username + "** recieved daily **100** 🍅 Your color of the day is " + randomColor());
    });
}

function leaderboard(arg, guild, callback) {
    let global = arg == 'global';
    let collection = mongodb.collection('users');
    collection.aggregate(
        { $unwind : '$cards' },
        { $group : { _id : '$username', 'levels' : { $sum : '$cards.level' }}}, 
        { $sort : { 'levels': -1 } }
        ).toArray((err, users) => {
            users.sort(dynamicSort('-levels'));
            if(!users || users.length == 0) return;

            if(global) {
                callback("**Global TOP5 Card Owners:**\n" + nameOwners(users));
            } else if(guild) {
                let includedUsers = [];
                try {
                    users.forEach((elem) => {
                        guild.members.forEach((mem) => {
                            if(mem.user.username == elem._id) {
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

function toTitleCase(str) {
    return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
}

function countDuplicates(arr) {
    arr.sort(dynamicSort("name"));
    //arr.sort(dynamicSort("-level"));

    var res = [];
    var current = null;
    var cnt = 0;
    for (var i = 0; i < arr.length; i++) {
        if(!arr[i]) continue;
        if (!current || arr[i].name != current.name) {
            if (cnt > 0) {
                let c = nameCard(current, cnt);
                if(c) res.push(c);
            }
            current = arr[i];
            cnt = 1;
        } else {
            cnt++;
        }
    }
    if (cnt > 0) {
        let c = nameCard(current, cnt);
        if(c) res.push(c);
    }
    res.sort().reverse();

    return res.join('\n');
}

function removeCard(target, collection) {
    for(let i=0; i<collection.length; i++) {
        if(collection[i].name == target.name) {
            collection.splice(i, 1);
            return collection;
        }
    }
}

function nameOwners(col) {
    let res = '';
    for(let i=0; i<col.length; i++) {
        res += (i+1).toString() + ". ";
        res += "**" + col[i]._id + "**";
        res += " (" + col[i].levels + " stars)\n";
        if(i >= 4) break;
    }
    return res;
}

function nameCard(card, count) {
    try {
        let res = "[";

        for(let i=0; i<parseInt(card.level); i++)
            res += "★";

        res += "]  ";
        res += toTitleCase(card.name.replace(/_/g, " "));
        res += " (x" + count + ")";
        return res;
    } catch (e) {}
    return null;
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
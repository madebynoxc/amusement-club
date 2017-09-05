module.exports = {
    processRequest, connect, getInfo
}

var mongodb, ucollection;
const fs = require('fs');
const crafted = require('../crafted/cards.json');
const logger = require('./log.js');
const utils = require('./localutils.js');
const heroes = require('./hero.js');
const dbManager = require("./dbmanager.js");

function connect(db) {
    mongodb = db;
    ucollection = db.collection('users');
}

function processRequest(userID, args, callback) {
    ucollection.findOne({ discord_id: userID }).then((dbUser) => {
        if(!dbUser) return;

        var req = args.shift();
        switch(req) {
            case "info":
                if(args.length > 0)
                    getInfo(dbUser, args.join('_'), callback);
                break;
            default:
                args.unshift(req)
                craftCard(dbUser, args, callback);
                break;
        }
    }).catch(e => logger.error(e));
}

function getCardByName(name) {
    return crafted.filter(c => c.name.includes(name))[0];
}

function getInfo(user, name, callback, image = false) {
    var card = crafted.filter(c => c.name.includes(name))[0];
    if(card) {
        let cardName = utils.toTitleCase(card.name.replace(/_/g, " "));
        let res = "Info about **" + cardName + "** craft card:";
        res += "\nForge cost: **" + card.cost + "**🍅";
        res += "\nRequired hero level: **" + card.level + "**";
        res += "\nRequired cards: ";
        for(i in card.cards) {
            res += "**" + utils.toTitleCase(card.cards[i].replace(/_/g, " ")) + "**";
            res += (i + 1 == card.cards.length)? " " : ", ";
        }
        res += "\nEffect: *" + card.effect + "*";
        if(!image) res += "\nUse `->forge [card1], [card2], ...`";
        callback(res, image? 
            {file: "./crafted/" + crafted[i].name + (crafted[i].compressed? '.jpg' : '.png')} : 
            undefined);
    } else callback("**" + user.username + 
        "**, forged card with name **" + name.replace(/_/g, " ") + 
        "** was not found");
}

function craftCard(user, args, callback) {
    var cards = args.join('_').split(',');
    if(!cards || cards.length < 2) {
        callback("Minimum **2** cards required for forge");
        return;
    }

    let cardNames = [];
    for(i in cards) {
        let name = cards[i];
        if(cards[i][0] == "_") 
            name = cards[i].substr(1); 

        let card = dbManager.getBestCardSorted(user.cards, name)[0];
        if(!card) {
            callback("**" + user.username 
                + "**, card with name **" + name.replace(/_/g, " ")
                + "** was not found, or you don't have it");
            return;
        }
        cardNames.push(card.name);
    }

    for(i in crafted) {
        let count = 0;
        let dif = crafted[i].cards.filter(x => !cardNames.includes(x));

        if(dif.length == 0) {
            let err = "";
            let curName = utils.toTitleCase(crafted[i].name.replace(/_/g, " "));
            if(user.exp < crafted[i].cost) {
                err += "**" + user.username + "**, you don't have enough 🍅 Tomatoes "
                + "to craft this card. You need at least **" + crafted[i].cost + "**🍅\n";
            }

            if(!user.hero || heroes.getHeroLevel(user.hero.exp) < crafted[i].level) {
                err += "**" + user.username + "**, your **hero level** is lower, than "
                + "required level **" + crafted[i].level + "**\n";
            }

            if(err != "") {
                callback(err + "To see all requirements, use `->forge info " + curName + "`");
                return;
            }

            //let usercards = user.cards
            ucollection.update( 
                { discord_id: user.discord_id},
                { 
                    $push: {inventory: {name: crafted[i].name, type: 'craft'}},
                    $inc: {exp: -crafted[i].cost}
                }
            ).then(u => {
                callback("**" + user.username 
                + "**, you crafted **" 
                + curName + "**\n"
                + "Card was added to your inventory, and now gives you:\n**"
                + crafted[i].effect + "**\n"
                + "Use `->inv` to check your inventory", 
                {file: "./crafted/" + crafted[i].name + (crafted[i].compressed? '.jpg' : '.png')});
            }).catch(e => logger.error(e));
            return;
        }
    }

    callback("**" + user.username 
        + "**, you can't forge a craft card with those source cards");
}
module.exports = {
    processRequest, connect, setBot, checkAuctions, startTimer
}

var mongodb, acollection, ucollection, bot;
var dbManager = require('./dbmanager.js');
var react = require('./reactions');
var utils = require('./localutils');
var timeago = require("timeago.js");
const settings = require('../settings/general.json');
var timerActive = false;

function connect(db) {
    mongodb = db;
    acollection = db.collection('auctions');
    ucollection = db.collection('users');
    bcollection = db.collection('bid_history');
    startTimer();
}

function setBot(b) {
    bot = b;
}

function startTimer() {
    if(timerActive) return;
    acollection.aggregate([
        {"$match": {'finished': 0}},
        {"$sort": {date: 1}},
        {"$limit": 1}
    ]).toArray((err, objs) => {
        if(!objs[0]) return;
        let nextFinishing = objs[0];
        let remainingTime = (new Date(nextFinishing.date.getTime() + settings.auctionduration).getTime() - new Date().getTime()) + 5000; 
        timerActive = true;
        setTimeout(checkAuctions, remainingTime);
    });
}

async function checkAuctions() {
    if(!timerActive) return;
    await acollection.aggregate([
        {"$match": {'finished': 0, date : {$lte: new Date(new Date().getTime() - (settings.auctionduration))}}},
        {"$sort": {date: 1}}
    ]).toArray(async (err, objs) => {
        await objs.forEach(async (element) => {
            await acollection.update( 
                { auctionid: element.auctionid},
                {
                    $set: {finished: 1}
                },
            );
            if(element.lastbidder != -1) {
                await ucollection.findOne({ discord_id: element.lastbidder }).then(async (res) => {
                    if(res.exp >= element.bid) {
                        let cards = dbManager.addCardToUser(res.cards, element.card);
                        await ucollection.update( 
                            { discord_id: element.lastbidder},
                            {
                                $set: {cards: cards},
                                $inc: {exp: -element.bid}
                            },
                        ).then(async (u)=>{
                            await ucollection.update( 
                                { discord_id: element.seller},
                                {
                                    $inc: {exp: element.bid}
                                },
                            ).then(async (u)=>{

                            });
                            bot.createDMChannel(element.lastbidder, (err, res) => {
                                if(!err) {
                                    bot.sendMessage({to: res.id, message: "You won auction for **" + utils.formatCardName(element.card.name) + "** for **" + element.bid + "** 🍅"});
                                }
                            });
                            bot.createDMChannel(element.seller, (err, res) => {
                                if(!err) {
                                    bot.sendMessage({to: res.id, message: "You won **" + element.bid + "** 🍅 for **" + utils.formatCardName(element.card.name) + "**"});
                                }
                            });
                        });
                    }
                });
            } else {
                await ucollection.findOne({ discord_id: element.seller }).then(async (res) => {
                    let cards = dbManager.addCardToUser(res.cards, element.card);
                    await ucollection.update( 
                        { discord_id: element.seller},
                        {
                            $set: {cards: cards},
                        },
                    ).then(async (u)=>{
                        bot.createDMChannel(element.seller, (err, res) => {
                            if(!err) {
                                bot.sendMessage({to: res.id, message: "Nobody bidded your auction for **" + utils.formatCardName(element.card.name) + "**. You got it back."});
                            }
                        });
                    });
                });
            }
        });
        timerActive = false; 
    });
    startTimer();
    return;
}

function processRequest(user, args, callback) {
    var req = args.shift();
    switch(req) {
        case 'bid':
            var auctionId = "";
            var bid = 0;
            args.forEach(element => {
                if(utils.isInt(element))
                    bid = parseInt(element);
                else
                    auctionId = element;
            });
            acollection.aggregate([
                {"$match": {
                    'auctionid': auctionId,
                    'finished': 0,
                    'date': {$gte : new Date(new Date().getTime() - (settings.auctionduration))}
                }},
                {"$sort": {date: -1}}
            ]).toArray((err, objs) => {
                if(!objs[0]) return callback(utils.formatError(user, "Can't find auction", "can't find auction matching that request"));

                ucollection.aggregate([
                    {"$match": {discord_id: user.id}}
                ]).toArray((err, users) => {
                    if(!users[0]) return;

                    let auction = objs[0];
                    let bidder = users[0];
                    if(bid > bidder.exp) return callback(utils.formatError(user, "You don't have enough 🍅 to bid", "you're not enough rich to bid **" + bid + "** 🍅"));
                    if(auction.seller == user.id) return callback(utils.formatError(user, "You can bid to this auction", "why would you buy your card?"));
                    if(bid > auction.bid) {
                        auction.bid = bid;
                        auction.lastbidder = user.id;
                        acollection.update(
                            { auctionid: auction.auctionid },
                            { $set: auction }
                        );
                        bcollection.insert({
                            auctionid: auction.auctionid,
                            bid: bid,
                            bidder: user.id,
                            date: new Date()
                        })
                        let remainingTime = (new Date(auction.date.getTime() + settings.auctionduration).getTime() - new Date().getTime())/1000;
                        return callback(utils.formatConfirm(user, null, "you bidded " + bid + " 🍅 for " + utils.toTitleCase(auction.card.name.replace(/_/g, " ")) + "!", "Remaining time for the auction : " + utils.secondsToString(remainingTime)));
                    } else {
                        return callback(utils.formatError(user, null, "you have to bid higher than the bidding"))
                    }
                });
            });
            break;
        case 'sell':
            let price = 0;
            let name = "";
            var keywords = [];
            args.forEach(element => {
                if(utils.isInt(element))
                    price = parseInt(element);
                else
                    keywords.push(element);
            });
            if(price <= 0) return callback(utils.formatError(user, null, 'your price should be greater than 0'));
            name = keywords.join('_');
            dbManager.getUserCards(user.id, {}).toArray((err, objs) => {
                let cards = objs[0].cards;

                dbManager.getUserCards(user.id, {'cards.name': new RegExp("(_|^)" + keywords.join('_'), 'ig')}).toArray((err, objs) => {
                    if(!objs[0]) return callback(utils.formatError(user, "Can't find card", "can't find card matching that request"));

                    let card = dbManager.getBestCardSorted(cards, name)[0];
                    cards = dbManager.removeCardFromUser(cards, card);
                    ucollection.update(
                        { discord_id: user.id },
                        {
                            $set: {cards: cards },
                        }
                    ).then(e => {
                        acollection.insert({
                            seller: user.id,
                            bid: price,
                            date: new Date(),
                            card: card,
                            lastbidder: -1,
                            auctionid: generateRandomAuctionId(),
                            finished: 0
                        });
                        let name = utils.formatCardName(card.name);
                        callback(utils.formatConfirm(user, "Card put in the auctions market", "you added **" + name + "** to market for **" + price + "** 🍅"));
                        startTimer();
                    });
                });
            });
            break;
        case 'info':
            var auctionId = "";
            args.forEach(element => {
                    auctionId = element;
            });
            acollection.aggregate([
                {"$match": {'auctionid': auctionId}}
            ]).toArray((err, objs) => {
                if(!objs[0]) return callback(utils.formatError(user, "Can't find auction", "can't find auction matching that id"));
                let auction = objs[0];
                let remainingTime = (new Date(auction.date.getTime() + settings.auctionduration).getTime() - new Date().getTime())/1000; 
                callback(utils.formatInfo(null, "Auction for " + utils.formatCardName(auction.card.name), "Card **" + utils.formatCardName(auction.card.name) + "** is bidded for **" + auction.bid + "** 🍅\nAuction ends in " + utils.secondsToString(remainingTime)));
            });
            break;
        case 'history':
            var auctionId = "";
            args.forEach(element => {
                    auctionId = element;
            });
            bcollection.aggregate([
                {"$match": {'auctionid': auctionId}},
                {"$sort": {date: -1}}
            ]).toArray((err, objs) => {
                if(!objs[0]) return callback(utils.formatError(user, "Can't find auction", "can't find auction matching that id"));
                var description = objs.map(element => {
                    return '**' + element.bid + '** 🍅 ' + timeago().format(new Date(element.date).getTime());
                }).join('\n');
                callback(utils.formatInfo(null, "History for this auction", description));
            });
            break;
        default:
            if(req != undefined) args.unshift(req);
            dbManager.getAuctionsCards(utils.getRequestFromFiltersWithPrefix("card.", args)).toArray((err, objs) => {
                callback(react.addNew(user, objs, null, "auctions"));
            });
            break;
    }
    startTimer();
}

function generateRandomAuctionId() {
    return Math.random().toString(36).slice(-5);
}
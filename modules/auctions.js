module.exports = {
    processRequest, connect, checkAuctions
}

var mongodb, acollection, ucollection, bot;
const dbManager = require('./dbmanager.js');
const reactions = require('./reactions');
const utils = require('./localutils');
//const timeago = require("timeago.js");
const settings = require('../settings/general.json');
var timerActive = false;

function connect(db, client) {
    mongodb = db;
    bot = client;
    acollection = db.collection('auctions');
    ucollection = db.collection('users');
    tcollection = db.collection('transactions');
    //startTimer();
    setInterval(checkAuctions, 10000);
}

function processRequest(user, args, channelID, callback) {
    let command = args.shift();
    switch(command) {
        case 'sell':
            sell(user, args, channelID, callback);
            break;
        case 'bid':
            bid(user, args, callback);
            break;
        case 'info':
            info(user, args, callback);
            break;
        default:
            list(user, args, channelID, callback);
            break;
    }
}

async function list(user, args, channelID, callback) {
    let pages = getPages(await acollection.aggregate([
        {"$match": {finished: false}},
        {"$match": utils.getRequestFromFiltersWithPrefix(args, "card.")},
        {"$sort": {date: 1}},
        {"$limit": 200}
    ]).toArray());

    if(pages.length == 0) return callback(utils.formatError(user, null, 
        "no auctions with that request found"));

    reactions.addNewPagination(user.id, "Current auctions", pages, channelID);
}

async function bid(user, args, callback) {
    if(!args || args.length < 2)
        return callback("**" + user.username + "**, please specify auction ID and bid amount");

    if(!utils.isInt(args[1]))
        return callback(utils.formatError(user, null, "price should be a number"));

    let price = parseInt(args[1]);
    let auc = await acollection.findOne({id: args[0]});
    if(!auc)
        return callback(utils.formatError(user, null, "auction `" + args[0] + "` not found"));

    if(price <= auc.price)
        return callback(utils.formatError(user, null, "your bid for this auction should be more than **" + auc.price + "**🍅"));

    let dbUser = await ucollection.findOne({discord_id: user.id});
    if(dbUser.exp < price)
        return callback(utils.formatError(user, null, "you do not have enough tomatoes for that bid"));

    await acollection.update({id: auc.id}, {$set: {price: price, lastbidder: user.id}});
    await ucollection.update({discord_id: user.id}, {$inc: {exp: -price}});
    if(auc.lastbidder) {
        await ucollection.update({discord_id: auc.lastbidder}, {$inc: {exp: auc.price}});
        bot.sendMessage({to: auc.lastbidder, embed: utils.formatWarning(null, "You are losing auction!", 
            "Another player has outbid you on card **" + utils.getFullCard(auc.card)  + "** with a bid of **" + price + "**🍅\n"
            + "To remain in the auction, you should increase your bid. Use `->bid " + auc.id + " [new bid]`\n"
            + "This auction will end in **" + getTime(auc) + "**")});
    }

    let p = utils.formatConfirm(user, "Bid placed", "you are now leading in auction for **" + utils.getFullCard(auc.card) + "**!");
    p.footer = {text: "Auction ID: " + auc.id}
    callback(p);
}

async function sell(user, incArgs, channelID, callback) {
    let args = incArgs.join(' ').split(',');
    if(!args || args.length < 2) 
        return callback("**" + user.username + "**, please specify card query and price seperated by `,`");

    let query = utils.getRequestFromFilters(args[0].split(' '));
    dbManager.getUserCards(user.id, query).toArray((err, objs) => {
        if(!objs[0]) 
            return callback(utils.formatError(user, null, "no cards found that match your request"));
        
        if(!utils.isInt(args[1]))
            return callback(utils.formatError(user, null, "price should be a number"));

        let price = parseInt(args[1]);
        let match = objs[0].cards[0];
        if(!match) return callback(utils.formatError(user, "Can't find card", "can't find card matching that request"));
        match.fav = false;

        dbManager.getCardValue(match, async (eval) => {
            let p = Math.round(eval * .5);
            let dbUser = await ucollection.findOne({discord_id: user.id});
            if(price < p)
                return callback(utils.formatError(user, null, "You can't set price less than **" + Math.round(p) + "**🍅 for this card"));

            if(dbUser.exp - 100 < 0)
                return callback(utils.formatError(user, null, "You have to have at least **100**🍅 to use auction"));

            reactions.addNewConfirmation(user.id, formatSell(user, match, price), channelID, async () => {
                let aucID = utils.generateRandomId();
                dbUser.cards = dbManager.removeCardFromUser(dbUser.cards, match);

                await ucollection.update({discord_id: user.id}, {$set: {cards: dbUser.cards}, $inc: {exp: -100}});
                await acollection.insert({
                    id: aucID, finished: false, date: new Date(), price: price, author: user.id, card: match
                });

                callback(utils.formatConfirm(user, null, "You successfully put **" + utils.getFullCard(match) + "** on auction.\nYour auction ID `" + aucID + "`"));
            });
        });
    });
}

function formatSell(user, card, price) {
    let w = utils.formatWarning(user, null, "do you want to sell \n**" + utils.getFullCard(card) + "** on auction for **" + price + "**🍅?");
    w.footer = { text: "This will cost you 100 tomatoes" }
    return w;
}

async function info(user, args, callback) {
    if(!args || args.length < 1)
        return callback("**" + user.username + "**, please specify auction ID");

    let auc = await acollection.findOne({id: args[0]});
    if(!auc)
        return callback(utils.formatError(user, null, "auction `" + args[0] + "` not found"));

    let author = await ucollection.findOne({discord_id: auc.author});
    dbManager.getCardValue(auc.card, (eval) => {
        let resp = "";
        resp += "Seller: **" + author.username + "**\n";
        resp += "Finishes in: **" + getTime(auc) + "**\n";
        resp += "Last bid: **" + auc.price + "**🍅\n";
        resp += "Card: **" + utils.getFullCard(auc.card) + "**\n";
        resp += "Card value: **" + Math.floor(eval) + "**🍅";

        callback(utils.formatInfo(null, "Information about auction", resp));
    });
}

async function checkAuctionList() {
    let auc = await acollection.aggregate([
        {"$match": {'finished': false, date : {$lte: new Date(new Date().getTime() - 5)}}},
        {"$sort": {date: 1}, {limit: 1}}
    ]).toArray();

    if(!auc) return;

    let dbuser = await ucollection.findOne({discord_id: auc.lastbidder});
    let transaction = {
        auc_id = auc.id,
        from: dbUser.username,
        from_id: dbUser.discord_id,
        status: "auction",
        time: new Date()
    }

    if(auc.lastbidder) {
        let bidder = await ucollection.findOne({discord_id: auc.lastbidder});
        bidder.cards = dbManager.addCardToUser(bidder.cards, auc.card);
        await ucollection.update({discord_id: auc.lastbidder}, {$set: {cards: bidder.cards}});
        await ucollection.update({discord_id: auc.author}, {$inc: {exp: auc.price}});

        transaction.to = bidder.username;
        transaction.to_id = bidder.discord_id;
        transaction.card = auc.card;
        await tcollection.insert(transaction);

        bot.sendMessage({to: auc.lastbidder, embed: utils.formatConfirm(null, "Yaaay!", 
            "You won an auction for **" + utils.getFullCard(auc.card) + "**!\n Card is now yours")});
        bot.sendMessage({to: auc.author, embed: utils.formatConfirm(null, null, 
            "Your auction for card **" + utils.getFullCard(auc.card) + "** finished!\n"
            + "You got **" + auc.price + "**🍅 for it")});
    } else {
        dbuser.cards = dbManager.addCardToUser(dbuser.cards, auc.card);
        await ucollection.update({discord_id: auc.author}, {$set: {cards: dbuser.cards}});

        bot.sendMessage({to: auc.author, embed: utils.formatError(null, null, 
            "Your auction for card **" + utils.getFullCard(auc.card) + "** finished, but nobody bid on it.\n"
            + "You got your card back")});
    }

    await acollection.update({id: auc.id}, {$set: {finished: true}});
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

                        let t1 = {
                            from: '**Auction**',
                            from_id: element.seller,
                            to: null,
                            to_id: element.lastbidder,
                            card: element.card,
                            guild: '**Auction**',
                            guild_id: -1,
                            time: new Date(),
                            auction: 1
                        }
                        
                        let t2 = {
                            from: '**Auction**',
                            from_id: element.lastbidder,
                            to: null,
                            to_id: element.seller,
                            exp: element.bid,
                            guild: '**Auction**',
                            guild_id: -1,
                            time: new Date(),
                            auction: 1
                        }
    
                        mongodb.collection('transactions').insert([t1,t2]);

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
                    } else {
                        var finished = false;
                        await bcollection.aggregate([
                            {"$match": {auctionid: element.auctionid}},
                            {"$lookup": {
                                from: "users",
                                localField: "bidder",
                                foreignField: "discord_id",
                                as: "user",
                            }}
                        ]).toArray(async (err, objs) => {
                            await objs.forEach(async (history) => {
                                if(finished) return;
                                
                                if (history.user[0].exp >= history.bid) {
                                    finished = true;
                                    let cards = dbManager.addCardToUser(history.user[0].cards, element.card);

                                    let t1 = {
                                        from: 'Auction',
                                        from_id: element.seller,
                                        to: null,
                                        to_id: history.bidder,
                                        card: element.card,
                                        guild: '**Auction**',
                                        guild_id: -1,
                                        time: new Date(),
                                        auction: 1
                                    }
                                    let t2 = {
                                        from: 'Auction',
                                        from_id: history.bidder,
                                        to: null,
                                        to_id: element.seller,
                                        exp: history.bid,
                                        guild: 'Auction',
                                        guild_id: -1,
                                        time: new Date(),
                                        auction: 1
                                    }
                
                                    mongodb.collection('transactions').insert([t1,t2]);

                                    await ucollection.update(
                                        { discord_id: history.bidder },
                                        {
                                            $set: { cards: cards },
                                            $inc: { exp: -history.bid }
                                        },
                                    ).then(async (u) => {
                                        await ucollection.update(
                                            { discord_id: element.seller },
                                            {
                                                $inc: { exp: history.bid }
                                            },
                                        );
                                        bot.createDMChannel(history.bidder, (err, res) => {
                                            if (!err) {
                                                bot.sendMessage({ to: res.id, message: "You won auction for **" + utils.formatCardName(element.card.name) + "** for **" + history.bid + "** 🍅" });
                                            }
                                        });
                                        bot.createDMChannel(element.seller, (err, res) => {
                                            if (!err) {
                                                bot.sendMessage({ to: res.id, message: "You won **" + history.bid + "** 🍅 for **" + utils.formatCardName(element.card.name) + "**" });
                                            }
                                        });
                                    });
                                }
                            });

                            if(!finished) {
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
                                                bot.sendMessage({to: res.id, message: "Nobody bid your auction for **" + utils.formatCardName(element.card.name) + "**. You got it back."});
                                            }
                                        });
                                    });
                                });
                            }
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
                                bot.sendMessage({to: res.id, message: "Nobody bid your auction for **" + utils.formatCardName(element.card.name) + "**. You got it back."});
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

function getPages(auc) {
    let count = 0;
    let pages = [];
    auc.map(c => {
        if(count % 10 == 0)
            pages.push("");

        pages[Math.floor(count/10)] += auctionToString(c);
        count++;
    });
    return pages.filter(item => item != "");
}

function auctionToString(auc) {
    let resp = "";
    let hours = 5 - utils.getHoursDifference(auc.date);

    if(hours < 0) return "";

    resp += "[" + getTime(auc) + "] ";
    resp += "[" + auc.id + "] ";
    resp += "[" + auc.price + "🍅] ";
    resp += "**" + utils.getFullCard(auc.card) + "**\n";
    return resp;
}

function getTime(auc) {
    let hours = 5 - utils.getHoursDifference(auc.date);
    if(hours == 1){
        let mins = 60 - (utils.getMinutesDifference(auc.date) % 60);
        return mins + "m";
    } else 
        return hours + "h";
}


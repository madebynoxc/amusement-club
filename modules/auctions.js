module.exports = {
    processRequest, connect, checkAuctionList
}

var mongodb, acollection, ucollection, bot;
const dbManager = require('./dbmanager.js');
const reactions = require('./reactions');
const utils = require('./localutils');
const forge = require('./forge.js');
const heroes = require('./heroes.js');
const quests = require('./quest.js');
const settings = require('../settings/general.json');
const aucTime = 5;

function connect(db, client) {
    mongodb = db;
    bot = client;
    acollection = db.collection('auctions');
    ucollection = db.collection('users');
    tcollection = db.collection('transactions');
    setInterval(checkAuctionList, 5000);
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
            info(user, args, channelID, callback);
            break;
        default:
            if(command) args.push(command);
            list(user, args, channelID, callback);
            break;
    }
}

async function list(user, args, channelID, callback) {
    let match = {finished: false};
    let title = "Current auctions";

    args.map(a => {
        if(a[0] === '!' || a[0] === '-') {
            let el = a.substr(1);
            let m = a[0] == '!'? { $ne: user.id } : user.id;
            switch(el){
                case 'me':
                    match.author = m;
                    title = "Your auctions";
                    args = args.filter(arg => arg != a);
                    break;
                case 'bid':
                    match.lastbidder = m;
                    title = "Your bids";
                    args = args.filter(arg => arg != a);
                    break;
            }
        }
    });

    let pages = getPages(await acollection.aggregate([
        {"$match": match},
        {"$match": utils.getRequestFromFiltersWithPrefix(args, "card.")},
        {"$sort": {date: 1}},
        {"$limit": 200}
    ]).toArray(), user.id);

    if(pages.length == 0) return callback(utils.formatError(user, null, 
        "no auctions with that request found"));

    reactions.addNewPagination(user.id, title, pages, channelID);
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

    if(auc.author == user.id) 
        return callback(utils.formatError(user, null, "you can't bid on your own auction"));

    if(auc.finished)
        return callback(utils.formatError(user, null, "auction `" + args[0] + "` already finished"));

    if(price <= auc.price)  {
        let bidresp = "your bid for this auction should be more than **" + auc.price + "**🍅";
        if(auc.hidebid) bidresp = "your bid is too low! Bid amount is hidden by hero effect.";
        return callback(utils.formatError(user, null, bidresp));
    }

    let dbUser = await ucollection.findOne({discord_id: user.id});
    if(!dbUser.hero)
        return callback(utils.formatError(user, null, "you have to have a hero in order to take part in auction"));

    if(dbUser.exp < price)
        return callback(utils.formatError(user, null, "you do not have enough tomatoes for that bid"));

    if(auc.lastbidder && auc.lastbidder == user.id) 
        return callback(utils.formatError(user, null, "you already bidded on that auction"));

    let hidebid = heroes.getHeroEffect(dbUser, 'auc', false);
    await acollection.update({id: auc.id}, {$set: {price: price, lastbidder: user.id, hidebid: hidebid}});
    await ucollection.update({discord_id: user.id}, {$inc: {exp: -price}});
    if(auc.lastbidder) {
        await ucollection.update({discord_id: auc.lastbidder}, {$inc: {exp: auc.price}});
        let strprice = hidebid? "???" : price;
        bot.sendMessage({to: auc.lastbidder, embed: utils.formatWarning(null, "Oh no!", 
            "Another player has outbid you on card **" + utils.getFullCard(auc.card)  + "** with a bid of **" + strprice + "**🍅\n"
            + "To remain in the auction, you should increase your bid. Use `->auc bid " + auc.id + " [new bid]`\n"
            + "This auction will end in **" + getTime(auc) + "**")});
    }

    let p = utils.formatConfirm(user, "Bid placed", "you are now leading in auction for **" + utils.getFullCard(auc.card) + "**!");
    p.footer = {text: "Auction ID: " + auc.id}
    callback(p);

    quests.checkAuction(dbUser, "bid", callback);
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

            if(!dbUser.hero)
                return callback(utils.formatError(user, null, "you have to have a hero in order to take part in auction"));

            if(price < p)
                return callback(utils.formatError(user, null, "you can't set price less than **" + Math.round(p) + "**🍅 for this card"));

            if(price > eval * 4)
                return callback(utils.formatError(user, null, "you can't set price more than **" + Math.round(eval * 4) + "**🍅 for this card"));

            if(dbUser.exp - 100 < 0)
                return callback(utils.formatError(user, null, "you have to have at least **100**🍅 to use auction"));

            reactions.addNewConfirmation(user.id, formatSell(user, match, price), channelID, async () => {
                let aucID = await generateBetterID();
                dbUser.cards = dbManager.removeCardFromUser(dbUser.cards, match);

                await ucollection.update({discord_id: user.id}, {$set: {cards: dbUser.cards}, $inc: {exp: -100}});
                await acollection.insert({
                    id: aucID, finished: false, date: new Date(), price: price, author: user.id, card: match
                });

                callback(utils.formatConfirm(user, null, "you successfully put **" + utils.getFullCard(match) + "** on auction.\nYour auction ID `" + aucID + "`"));
                quests.checkAuction(dbUser, "sell", callback);
            });
        });
    });
}

function formatSell(user, card, price) {
    let w = utils.formatWarning(user, null, "do you want to sell \n**" + utils.getFullCard(card) + "** on auction for **" + price + "**🍅?");
    w.footer = { text: "This will cost you 100 tomatoes" }
    return w;
}

async function info(user, args, channelID, callback) {
    if(!args || args.length < 1)
        return callback("**" + user.username + "**, please specify auction ID");

    let auc = await acollection.findOne({id: args[0]});
    if(!auc)
        return callback(utils.formatError(user, null, "auction `" + args[0] + "` not found"));

    let author = await ucollection.findOne({discord_id: auc.author});
    if(auc.hidebid && user.id != auc.lastbidder) auc.price = "???";
    
    dbManager.getCardValue(auc.card, (eval) => {
        let resp = "";
        resp += "Seller: **" + author.username + "**\n";
        resp += "Last bid: **" + auc.price + "**🍅\n";
        resp += "Card: **" + utils.getFullCard(auc.card) + "**\n";
        resp += "Card value: **" + Math.floor(eval) + "**🍅\n";
        if(user.id == auc.lastbidder && !auc.finished) 
            resp += "You are currently leading in this auction\n";
        if(auc.finished) resp += "This auction finished**\n";
        else resp += "Finishes in: **" + getTime(auc) + "**\n";

        bot.uploadFile({to: channelID, file: dbManager.getCardFile(auc.card)});
        callback(utils.formatInfo(null, "Information about auction", resp));
    });
}

async function checkAuctionList() {
    let timeago = new Date();
    timeago.setHours(timeago.getHours() - aucTime);
    //timeago.setMinutes(timeago.getMinutes() - aucTime);

    let awaitauc = await acollection.aggregate([
        {"$match": {'finished': false, 'date' : {$lt: timeago}}},
        {"$sort": {date: 1}}, {'$limit': 1}
    ]).toArray();

    let auc = awaitauc[0];
    if(!auc) return;

    let dbuser = await ucollection.findOne({discord_id: auc.author});
    let transaction = {
        id: auc.id,
        from: dbuser.username,
        from_id: dbuser.discord_id,
        status: "auction",
        time: new Date()
    }

    if(auc.lastbidder) {
        let bidder = await ucollection.findOne({discord_id: auc.lastbidder});
        bidder.cards = dbManager.addCardToUser(bidder.cards, auc.card);
        let tomatoback = Math.floor(forge.getCardEffect(bidder, 'auc', auc.price)[0]);
        await ucollection.update({discord_id: auc.lastbidder}, {$set: {cards: bidder.cards}}, {$inc : {exp: tomatoback}});
        await ucollection.update({discord_id: auc.author}, {$inc: {exp: auc.price}});

        transaction.to = bidder.username;
        transaction.to_id = bidder.discord_id;
        transaction.card = auc.card;
        await tcollection.insert(transaction);

        let yaaymes = "You won an auction for **" + utils.getFullCard(auc.card) + "**!\nCard is now yours.\n";
        if(tomatoback > 0) yaaymes += "You got **" + tomatoback + "** tomatoes back from that transaction.";
        bot.sendMessage({to: auc.lastbidder, embed: utils.formatConfirm(null, "Yaaay!", yaaymes)});
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

function getPages(auc, userID) {
    let count = 0;
    let pages = [];
    auc.map(c => {
        if(count % 10 == 0)
            pages.push("");

        pages[Math.floor(count/10)] += auctionToString(c, userID);
        count++;
    });
    return pages.filter(item => item != "");
}

function auctionToString(auc, userID) {
    let resp = "";
    let hours = aucTime - utils.getHoursDifference(auc.date);

    if(hours < 0) return "";

    if(auc.hidebid) auc.price = "???";

    if(userID == auc.author) resp += "🔹";
    else if(userID == auc.lastbidder) resp += "🔸";
    else resp += "▪️";
    resp += "`[" + getTime(auc) + "] ";
    resp += "[" + auc.id + "] ";
    resp += "[" + auc.price + "🍅]`  ";
    resp += "**" + utils.getFullCard(auc.card) + "**\n";
    return resp;
}

function getTime(auc) {
    let hours = aucTime - utils.getHoursDifference(auc.date);
    if(hours <= 1){
        let mins = 60 - (utils.getMinutesDifference(auc.date) % 60);
        return mins + "m";
    } else 
        return hours + "h";
}

async function generateBetterID() {
    let ids = await acollection.find({}, {id: 1}).toArray();
    let newID = "";
    do {
        newID = utils.generateRandomId();
    } while(ids.filter(i => i === newID).length > 0);
    return newID;
}


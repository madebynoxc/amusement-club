module.exports = {
    processRequest, connect, checkAuctionList
}

var mongodb, acollection, ucollection, bot;
const AsyncLock = require('async-lock');
const dbManager = require('./dbmanager.js');
const reactions = require('./reactions');
const utils = require('./localutils');
const forge = require('./forge.js');
const heroes = require('./heroes.js');
const quests = require('./quest.js');
const settings = require('../settings/general.json');
const aucTime = 5;
const idlock = new AsyncLock();

function connect(db, client, shard) {
    mongodb = db;
    bot = client;
    acollection = db.collection('auctions');
    ucollection = db.collection('users');
    tcollection = db.collection('transactions');

    if(shard == 0) {
        setInterval(function() {checkAuctionList(client);}, 5000);
    }
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
            if(command) args.unshift(command);
            list(user, args, channelID, callback);
            break;
    }
}

async function list(user, args, channelID, callback) {
    let match = {finished: false};
    let title = "Current auctions";
    let useDiff = false;

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
                case 'diff':
                case 'miss':
                    useDiff = true;
                    title = "Auctions with unique cards";
                    args = args.filter(arg => arg != a);
                    break;
            }
        }
    });

    let query = utils.getRequestFromFiltersWithPrefix(args, "card.");
    delete query["sortBy"];
    let auctionList = await acollection.aggregate([
            {"$match": match},
            {"$match": query},
            {"$sort": {date: 1}},
            {"$limit": 200}
        ]).toArray();

    if(useDiff) {
        let userCards = await ucollection.findOne({discord_id: user.id}, {cards: 1});
        auctionList = auctionList.filter(a => userCards.cards.filter(c => utils.cardsMatch(a.card, c)) == 0);
    }

    let pages = getPages(auctionList, user.id);
    if(pages.length == 0) return callback(utils.formatError(user, null, 
        "no auctions with that request found"));

    reactions.addNewPagination(user.id, title, pages, channelID);
}

async function bid(user, args, callback) {
    if(!args || args.length < 2)
        return callback("**" + user.username + "**, please specify auction ID and bid amount");

    if(!utils.isInt(args[1]))
        return callback(utils.formatError(user, null, "price should be a number"));

    args[0] = args[0].replace(",", "");
    let price = parseInt(args[1]);
    let auc = await acollection.findOne({id: args[0]});
    if(!auc)
        return callback(utils.formatError(user, null, "auction `" + args[0] + "` not found"));

    if(auc.author == user.id) 
        return callback(utils.formatError(user, null, "you can't bid on your own auction"));

    if(auc.finished)
        return callback(utils.formatError(user, null, "auction `" + args[0] + "` already finished"));

    let aucPrice = getNextBid(auc);
    if(price <= aucPrice)  {
        let bidresp = "your bid for this auction should be more than **" + aucPrice + "**🍅";
        if(auc.hidebid) bidresp = "your bid is **too low!** Bid amount is hidden by hero effect.";
        return callback(utils.formatError(user, null, bidresp));
    }

    aucPrice = Math.floor(aucPrice * 1.5);
    if(price > aucPrice)  {
        let bidresp = "your bid for this auction can't be higher than **" + aucPrice + "**🍅";
        if(auc.hidebid) bidresp = "your bid is **too high**! Bid amount is hidden by hero effect.";
        return callback(utils.formatError(user, null, bidresp));
    }

    let dbUser = await ucollection.findOne({discord_id: user.id});
    if ( dbUser.embargo ) {
        return callback(utils.formatError(user, "Embargo", 
            "you are banned from bidding on auctions. "+
            "Your dealings were found to be in violation of our communiy rules. "+
            "You can inquire further on our [Bot Discord](https://discord.gg/kqgAvdX)"));
    }
    if(!dbUser.hero)
        return callback(utils.formatError(user, null, "you have to have a hero in order to take part in auction"));

    if(dbUser.exp < price)
        return callback(utils.formatError(user, null, "you do not have enough tomatoes for that bid"));

    if(auc.lastbidder && auc.lastbidder == user.id) 
        return callback(utils.formatError(user, null, "you already bidded on that auction"));

    let hidebid = heroes.getHeroEffect(dbUser, 'auc', false);
    addExtraTime(auc);

    await ucollection.update({discord_id: user.id}, {$inc: {exp: -price}});
    if(auc.lastbidder) {
        await ucollection.update({discord_id: auc.lastbidder}, {$inc: {exp: auc.price}});
        auc.price = price;
        let strprice = hidebid? "???" : price;
        let msg = "Another player has outbid you on card **" + utils.getFullCard(auc.card)  + "** with a bid of **" + strprice + "**🍅\n";

        if(hidebid) msg += "Next required bid is hidden by hero effect.\n";
        else msg += "To remain in the auction, you should bid more than **" + getNextBid(auc) + "**🍅\n"
        msg += "Use `->auc bid " + auc.id + " [new bid]`\n";
        msg += "This auction will end in **" + getTimeUntilAucEnds(auc) + "**";
        sendDM(auc.lastbidder, utils.formatWarning(null, "Oh no!", msg));
    } else {
        auc.price = price;
        let strprice = hidebid? "???" : price;
        let msg = "A player has bid on your card **" + utils.getFullCard(auc.card)  + "** with a bid of **" + strprice + "**🍅\n";

        if(hidebid) msg += "The bid is hidden by hero effect.\n";
        msg += "This auction will end in **" + getTimeUntilAucEnds(auc) + "**";
        sendDM(auc.author, utils.formatInfo(null, "Yay!", msg));
    }

    if ( !auc.bids )
        auc.bids = [];
    auc.bids.unshift({"amount": price, "bidder": user.id, "date": new Date()});
    await acollection.update({_id: auc._id}, {$set: {
        price: price, 
        lastbidder: user.id, 
        hidebid: hidebid, 
        timeshift: auc.timeshift,
        date: auc.date,
        bids: auc.bids
    }});

    let p = utils.formatConfirm(user, "Bid placed", "you are now leading in auction for **" + utils.getFullCard(auc.card) + "**!");
    p.footer = {text: "Auction ID: " + auc.id}
    callback(p);

    quests.checkAuction(dbUser, "bid", callback);
}

function addExtraTime(auc) {
    if(!auc.timeshift) 
        auc.timeshift = 0;

    if(60*aucTime - utils.getMinutesDifference(auc.date) <= 5) {
        switch(auc.timeshift){
            case 0: auc.date.setMinutes(auc.date.getMinutes() + 5); break;
            case 1: auc.date.setMinutes(auc.date.getMinutes() + 2); break;
            default:
                auc.date.setMinutes(auc.date.getMinutes() + 1); break;
        }
        auc.timeshift++;
    }
    return auc;
}

async function sell(user, incArgs, channelID, callback) {
    if(settings.stopAucSell) {
        return callback(utils.formatError(user, "Auctions are disabled", 
            "auction selling is disabled right now. Please try again later"));
    }

    let args = incArgs.join(' ').split(',');
    if(!args || args.length < 1) 
        return callback("**" + user.username + "**, please specify card query and price seperated by `,`\n"
            + "Or do not specify price to use eval");

    let query = utils.getRequestFromFilters(args[0].split(' '));
    dbManager.getUserCards(user.id, query).toArray((err, objs) => {
        if(!objs || !objs[0]) 
            return callback(utils.formatError(user, null, "no cards found that match your request"));

        let cards = objs[0].cards;
        if(query['cards.name'] && cards.length > 1) {
            //Changes the regex to match the full name instead of any part of the name
            let exactMatch = new RegExp(query['cards.name'].source.replace("_|", "") + "$", "i");
            cards = cards.filter(c => exactMatch.test(c.name));
            //Continue if only one card with the exact name is found
            if(cards.length != 1) return callback(utils.formatError(user, "Ambiguous query", "found multiple cards with that name, try specifying further."));
        }

        let match = query['cards.name'] ? dbManager.getBestCardSorted(cards, query['cards.name'])[0] : cards[0];
        if(!match) return callback(utils.formatError(user, "Can't find card", "can't find card matching that request"));
        if (match.fav && match.amount == 1) 
            return callback(utils.formatError(user, null, "you can't sell favorite card."
                + " To remove from favorites use `->fav remove [card query]`"));

        let ccollection = mongodb.collection('cards');
        let cardQuery = utils.getCardQuery(match);
        ccollection.findOne(cardQuery).then((match0) => {
            dbManager.getCardValue(match0, match, async (eval) => {
                let price;

                if(!args[1])
                    price = Math.floor(eval);
                else if(!utils.isInt(args[1]))
                    return callback(utils.formatError(user, null, "price should be a number"));
                else price = parseInt(args[1]);

                let min = Math.round(eval * .5);
                let dbUser = await ucollection.findOne({discord_id: user.id});
                let fee = Math.round(price * .1);

                if ( dbUser.embargo ) {
                    return callback(utils.formatError(user, "Embargo", 
                        "you are not allowed to list cards at auction. "+
                        "Your dealings were found to be in violation of our communiy rules. "+
                        "You can inquire further on our [Bot Discord](https://discord.gg/kqgAvdX)"));
                }

                if(!dbUser.hero)
                    return callback(utils.formatError(user, null, "you have to have a hero in order to take part in auction"));

                if(price < min)
                    return callback(utils.formatError(user, null, "you can't set price less than **" + min + "**🍅 for this card"));

                if(price > eval * 4)
                    return callback(utils.formatError(user, null, "you can't set price more than **" + Math.round(eval * 4) + "**🍅 for this card"));

                if(dbUser.exp - fee < 0)
                    return callback(utils.formatError(user, null, "you have to have at least **" + fee + "**🍅 to auction for that price"));

                reactions.addNewConfirmation(user.id, formatSell(user, match, price, fee), channelID, async () => {
                    await idlock.acquire("createauction", async () => {
                        let pullResult = dbManager.pullCard(user.id, match);
                        match.fav = false;

                        if(!pullResult) return; 

                        await ucollection.update({discord_id: user.id}, {$inc: {exp: -fee}});
                        let aucID = await generateBetterID();
                        delete match.rating;
                        await acollection.insert({
                            id: aucID, finished: false, date: new Date(), price: price, author: user.id, card: match, bids:[]
                        });

                        callback(utils.formatConfirm(user, null, "you successfully put **" + utils.getFullCard(match) + "** on auction.\nYour auction ID `" + aucID + "`"));
                        quests.checkAuction(dbUser, "sell", callback);
                    });
                });
            });
        });
    });
}

function formatSell(user, card, price, fee) {
    let w = utils.formatWarning(user, null, "do you want to sell \n**" + utils.getFullCard(card) + "** on auction for **" + price + "**🍅?");
    w.footer = { text: "This will cost you " + fee + " tomatoes" }
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
    
    let cardQuery = utils.getCardQuery(auc.card);
    let ccollection = mongodb.collection('cards');
    ccollection.findOne(cardQuery).then((match) => {
        dbManager.getCardValue(match, auc.card, (eval) => {
            let resp = "";
            resp += "Seller: **" + author.username + "**\n";
            resp += "Last bid: **" + auc.price + "**`🍅`\n";
            resp += "Next minimum bid: **" + (auc.hidebid ? "???" : getNextBid(auc) + 1) + "**`🍅`\n"
            resp += "Card: **" + utils.getFullCard(auc.card) + "**\n";
            resp += "Card value: **" + Math.floor(eval) + "**`🍅`\n";
            resp += "[Card link](" + dbManager.getCardURL(auc.card, false) + ")\n";
            if(user.id == auc.lastbidder && !auc.finished) 
                resp += "You are currently leading in this auction\n";
            if(auc.finished) resp += "**This auction has finished**\n";
            else resp += "Finishes in: **" + getTimeUntilAucEnds(auc) + "**\n";

            let emb = utils.formatInfo(null, "Information about auction", resp);
            emb.image = {url: dbManager.getCardURL(auc.card, false)};
            callback(emb);
        });
    });
}

async function checkAuctionList(client) {
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
        price: auc.price,
        from: dbuser.username,
        from_id: dbuser.discord_id,
        status: "auction",
        time: new Date(),
        bids: auc.bids
    }

    if(auc.lastbidder) {
        let bidder = await ucollection.findOne({discord_id: auc.lastbidder});
        await dbManager.pushCard(auc.lastbidder, auc.card);
        let tomatoback = Math.floor(forge.getCardEffect(bidder, 'auc', auc.price)[0]);
        await ucollection.update({discord_id: auc.lastbidder}, {$inc: {exp: tomatoback}});
        await ucollection.update({discord_id: auc.author}, {$inc: {exp: auc.price}});

        transaction.to = bidder.username;
        transaction.to_id = bidder.discord_id;
        transaction.card = auc.card;
        await tcollection.insert(transaction);

        // Update eval price?
        let minSamples = 3; // eval will start returning the new eval system's price when it has this many samples.
        let maxSamples = 10; // the system will remove samples to make room for new ones after this mark is reached.
        let lowerBound = .50;
        let upperBound = 4;
        // Note: min and max samples above should not be the same number.
        let cardQuery = utils.getCardQuery(auc.card);
        dbManager.getCard(cardQuery).then((match) => {
            if ( !match.hasOwnProperty('evalSamples') )
                match.evalSamples = [];
            let isOutlier;
            if ( match.hasOwnProperty('eval') ) {
                // How does this auction's price compare to the stored eval price?
                isOutlier = auc.price < match.eval * lowerBound || auc.price > match.eval * upperBound;
            } else { 
                isOutlier = false;
            }
            if ( match.eval && auc.price > 2 * match.eval ) {
                //fraud detection
                mongodb.collection("overpricedAucs").insert({"aucId": auc.id,
                    "factor": parseFloat(auc.price/match.eval), "date": new Date()});
            }
            if ( !isOutlier ) { 
                // Add the new sample price.
                match.evalSamples.push(auc.price);
                // Trim the sample array if it's large enough already.
                while ( match.evalSamples.length > maxSamples )
                    match.evalSamples.shift(); 
                client.sendMessage({"to":settings.logchannel, "message":`Updating eval samples for **${utils.getFullCard(match)}**: ${JSON.stringify(match.evalSamples)}`});
                // Only update the eval price if enough sample prices exist.
                if ( match.evalSamples.length == minSamples ) {
                    // This card is reaching the threshhold for the first time. Make sure its samples somewhat agree.
                    client.sendMessage({"to":settings.logchannel, "message":`**${utils.getFullCard(match)}** has reached **${minSamples}** auction sales. Checking integrity of samples:\n ${JSON.stringify(match.evalSamples)}`});
                    let largeDisparity = false;
                    for(let i=0; i<match.evalSamples.length; i++) {
                        let othersSum = 0;
                        for(let j=0; j<match.evalSamples.length; j++) {
                            if (j!=i)
                                othersSum += match.evalSamples[j];
                            //let percentDiff = (match.evalSamples[i] - match.evalSamples[j]) / match.evalSamples[j];
                            //if ( percentDiff < 1-tolerance || percentDiff > 1+tolerance )
                            //   largeDisparity = true;
                        }
                        let othersAve = othersSum / (minSamples -1);
                        if ( match.evalSamples[i] < othersAve * lowerBound || match.evalSamples[i] > othersAve * upperBound )
                            largeDisparity = true;
                    }
                    if ( largeDisparity ) {
                        // This sample set is untrustworthy. Throw it out and wait for new data.
                        match.evalSamples = [];
                        client.sendMessage({"to":settings.logchannel, "message":'The samples were **thrown out**'});
                    } else {
                        client.sendMessage({"to":settings.logchannel, "message":'The samples were **acceptable**'});
                    }
                }
                if ( match.evalSamples.length >= minSamples ) {
                    // Calculate a new eval average from the samples.
                    match.eval = Math.round(match.evalSamples.reduce(function(a,b) {return a+b;}) / match.evalSamples.length);
                    client.sendMessage({"to":settings.logchannel, "message":'Updating eval for **'+  utils.getFullCard(match) +'**: '+ match.eval});
                }
                let colName = dbManager.getCardDbColName(match);
                mongodb.collection(colName).save(match).catch(function() {
                    client.sendMessage({"to":settings.logchannel, "message":'Could not save card back with new eval data: ' + utils.getFullCard(match)});
                });
            } else {
                client.sendMessage({"to":settings.logchannel, "message":'Auction outlier ignored for eval figuring: ' +JSON.stringify(auc)});
            }
        }).catch(function() {
            client.sendMessage({"to":settings.logchannel, "message":'Problem running eval price update for this auction:'+
                "\n"+ JSON.stringify(auc)});
        });

        let yaaymes = "You won an auction for **" + utils.getFullCard(auc.card) + "**!\nCard is now yours.\n";
        if(tomatoback > 0) yaaymes += "You got **" + tomatoback + "** tomatoes back from that transaction.";
        sendDM(auc.lastbidder, utils.formatConfirm(null, "Yaaay!", yaaymes));
        sendDM(auc.author, utils.formatConfirm(null, null, 
            "Your auction for card **" + utils.getFullCard(auc.card) + "** finished!\n"
            + "You got **" + auc.price + "**🍅 for it"));

        // Fraud alerts logic
        mongodb.collection("aucSellRate").update({"discord_id":auc.author},
              {$inc:{"sold":1}}, {"upsert":true});
    } else {
        await dbManager.pushCard(auc.author, auc.card);
        sendDM(auc.author, utils.formatError(null, null, 
            "Your auction for card **" + utils.getFullCard(auc.card) + "** finished, but nobody bid on it.\n"
            + "You got your card back"));
        // Fraud alerts logic
        mongodb.collection("aucSellRate").update({"discord_id":auc.author},
            {$inc:{"unsold":1}}, {"upsert":true});
    }

    await acollection.update({_id: auc._id}, {$set: {finished: true}});
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

    if(userID == auc.author) 
        if(auc.lastbidder == null) resp += "🔹";
        else resp += "🔷";
    else if(userID == auc.lastbidder) resp += "🔸";
    else resp += "▪";
    resp += "`[" + getTimeUntilAucEnds(auc) + "] ";
    resp += "[" + auc.id + "] ";
    resp += "[" + getNextBid(auc) + "🍅]`  ";
    resp += "**" + utils.getFullCard(auc.card) + "**\n";
    return resp;
}

function getTimeUntilAucEnds(auc) {
    var aucDate = new Date(auc.date);
    const timeUntilEndMs = aucDate.setHours(auc.date.getHours() + 5) - new Date();

    if (timeUntilEndMs <= 0)
        return "0s";
    
    const base = timeUntilEndMs / (1000 * 60);
    const hours = Math.floor(base / 60);
    const minutes = Math.floor(base % 60);
    const seconds = Math.floor((base * 60) % 60);
    return  hours > 0? `${hours}h ${minutes}m`  :
                minutes > 0  ? `${minutes}m ${seconds}s`:
                `${seconds}s`;
}

async function generateBetterID() {
    let lastAuction = (await acollection.find({}).sort({$natural: -1}).limit(1).toArray())[0];
    return utils.generateNextId(lastAuction? lastAuction.id : "neko");
}

function getNextBid(auc) {
    if(!utils.isInt(auc.price)) return "???";
    let newPrice = auc.price + auc.price * .02;
    let hours = aucTime - utils.getHoursDifference(auc.date);
    if(hours <= 1){
        let mins = 60 - (utils.getMinutesDifference(auc.date) % 60);
        newPrice += newPrice * (1/mins) * .2;
    }
    return Math.floor(newPrice);
    //return auc.price + 25;
}

function sendDM(toID, embed) {
    bot.createDMChannel(toID, (createErr, newChannel) => {
        if(newChannel) {
            bot.sendMessage({to: newChannel.id, embed: embed}, 
                (err, resp) => {
                if(err) {
                    console.log("[Auc] Failed to send message to created DM channel");
                    //console.error(err);
                }
            });
        }
    });
}

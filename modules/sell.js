module.exports = {
    processRequest, connect
}

var mongodb, ucollection, tcollection;
const fs = require('fs');
const utils = require('./localutils.js');
const dbmanager = require('./dbmanager.js');
const forge = require('./forge.js');
const react = require('./reactions.js');
const transModule = require('./transactions.js');
const settings = require('../settings/general.json');

function connect(db) {
    mongodb = db;
    ucollection = db.collection("users");
    tcollection = db.collection("transactions");
}

async function processRequest(user, args, guild, channelID, callback) {
    if(!args || args.length == 0) return callback("**" + user.username + "**, please specify card query");
    
    let dbUser = await ucollection.findOne({ discord_id: user.id });
    let parse = utils.getUserID(args);

    let res = await tcollection.findOne({from_id: dbUser.discord_id, status: "pending", to_id: parse.id});
    if(res) {
        let msg = "you have already set up transaction to this user.\n";
        if(parse.id) msg += "Target user has to run `->confirm " + res.id + "` to confirm it.\n";
        else msg += "To confirm it run `->confirm " + res.id + "`\nTo cancel use `->decline " + res.id + "`\n"
        msg += "Use `->trans info " + res.id + "` to get more details.";
        return callback(utils.formatError(dbUser, null, msg));
    }

    let transaction = {
        from: dbUser.username,
        from_id: dbUser.discord_id,
        status: "pending",
        guild: guild.name,
        guild_id: guild.id,
        time: new Date()
    }

    let query = utils.getRequestFromFilters(parse.input);

    let objs = await dbmanager.getUserCards(user.id, query).toArray();
    if(!objs[0]) return callback(utils.formatError(user, "Can't find cards", "can't find any card matching that request"));

    let cards = objs[0].cards;
    let match = query['cards.name'] ? dbmanager.getBestCardSorted(cards, query['cards.name'])[0] : cards[0];

    if (match.fav && match.amount == 1) 
        return callback(utils.formatError(user, null, "you can't sell favorite card."
        + " To remove from favorites use `->fav remove [card query]`"));

    let hours = 20 - utils.getHoursDifference(match.frozen);
    if (hours && hours > 0)
        return callback(utils.formatError(dbUser, 
            "Card is frozen",
            "the card '**" + utils.getFullCard(match) + "**' is frozen for **" 
            + hours + "** more hours! You can't transfer it"));

    transaction.card = match;
    transaction.id = utils.generateRandomId();

    if(parse.id) {
        if(parse.id == dbUser.discord_id)
            return callback(utils.formatError(user, ";~;", "you can't trade with yourself..."));

        let targetUser = await ucollection.findOne({discord_id: parse.id});
        if(!targetUser) return callback(utils.formatError(user, "User not found", "can't find target user. Make sure they already have at least one card."));

        if (targetUser.blocklist && targetUser.blocklist.includes(dbUser.discord_id))
        return callback(utils.formatError(dbUser, "Can't send card", "this user blocked trading with you"));

        transaction.to = targetUser.username;
        transaction.to_id = parse.id;

        transaction.price = await new Promise(resolve => {
            dbmanager.getCardValue(match, price => {
                resolve(Math.round(price));
            });
        });
        
        await tcollection.insert(transaction);
        targetUser.id = targetUser.discord_id;
        return react.addNewConfirmation(parse.id, formatSellRequest(targetUser, transaction), channelID, () => {
            transModule.confirm(targetUser, [transaction.id], callback);
        }, () => {
            transModule.decline(targetUser, [transaction.id], callback);
        });
    } else {
        transaction.price = forge.getCardEffect(dbUser, 'sell', settings.cardprice[match.level - 1])[0];
        await tcollection.insert(transaction);
        return react.addNewConfirmation(dbUser.discord_id, formatSellToBot(dbUser, transaction), channelID, () => {
            transModule.confirm(user, [transaction.id], callback);
        }, () => {
            transModule.decline(user, [transaction.id], callback);
        });
    }
}

function formatConfirmMessage(title) {
    return utils.formatConfirm(null, title, "Transaction was confirmed");
}

function formatDeclineMessage(title) {
    return utils.formatError(null, title, "Transaction was declined");
}

function formatSellToBot(user, trans) {
    let msg = "Sell **";
    msg += utils.getFullCard(trans.card) + "**\n";
    msg += "for **" + trans.price + "** 🍅?\n";

    let e = utils.formatWarning(null, "Sell to bot", msg);
    e.footer = {text: "->confirm OR ->decline " + trans.id };
    return e;
}

function formatSellRequest(touser, trans) {
    let msg = "user **" + trans.from + "** wants to sell you **\n";
    msg += utils.getFullCard(trans.card);
    msg += "** for **" + trans.price + "** 🍅\n";

    let e = utils.formatWarning(touser, "Incoming transaction", msg);
    e.footer = {text: "->confirm OR ->decline " + trans.id };
    return e;
}

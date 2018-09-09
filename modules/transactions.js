module.exports = {
    processRequest, connect, confirm, decline
}

var mongodb, collection, ucollection;
var userHandlingList = [];
const fs = require('fs');
const utils = require('./localutils.js');
const dbmanager = require('./dbmanager.js');
const react = require('./reactions.js');

function connect(db) {
    mongodb = db;
    collection = mongodb.collection("transactions");
    ucollection = mongodb.collection("users");
}

function processRequest(user, cmd, args, callback) {
    let req;
    if (cmd !== "trans" && cmd !== "transactions") {
        //Should be got, gets, sent or sends
        req = cmd;
    } else req = args.shift();

    switch (req) {
        case "gets":
            gets(user, callback);
            break;
        case "sends":
            sends(user, callback);
            break;
        case "pending":
            pending(user, callback);
            break;
        case "confirm":
            confirm(user, args, callback);
            break;
        case "decline":
            decline(user, args, callback);
            break;
        case "info":
            info(user, args, callback);
            break;
        default:
            all(user, callback);
            break;
    }
}

function formatTransactions(res, userid) {
    let count = 0;
    let resp = "";
    
    res.map(trans => {
        if(trans.id) {
            let mins = utils.getMinutesDifference(trans.time);
            let hrs = utils.getHoursDifference(trans.time);
            let timediff = (hrs < 1) ? (mins + "m") : (hrs + "h");
            if (hrs < 1 && mins < 1) timediff = "<1m";
            else if (hrs >= 100) timediff = "---";

            let isget = trans.from_id != userid;
            if(timediff.length == 3) resp += "`[" + timediff + "] ";
            else resp += "`[" + timediff + " ] ";

            resp += (trans.status == "confirmed" || trans.status == "auction")? (
                isget ? "⬅️" : "➡️") : (trans.status == "pending"? "❗" : "❌");
            resp += " [" + trans.id + "]`  ";
            resp += "**" + utils.toTitleCase(trans.card.name.replace(/_/g, " ")) + "**";
            resp += isget ? " <- `" + trans.from + "`" : " -> `" + (trans.to? trans.to : "<BOT>") + "`";
            resp += "\n";
        }
    });

    return resp;
}

async function info(user, args, callback) {
    if(!args || args.length == 0)
        return callback(utils.formatError(user, null, "please specify transaction ID"));

    let transactionId = args[0];
    let transaction = await collection.findOne({ id: transactionId, $or: [{from_id: user.id}, {to_id: user.id}] });
    if(!transaction) return callback(utils.formatError(user, null, "can't find transaction with ID '" + transactionId + "'"));
    let name = utils.getFullCard(transaction.card);

    let mins = utils.getMinutesDifference(transaction.time);
    let hrs = utils.getHoursDifference(transaction.time);
    let timediff = (hrs < 1) ? (mins + "m") : (hrs + "h");
    if (hrs < 1 && mins < 1) timediff = "just now";

    let resp = "Card: **" + name + "**\n";
    resp += "Price: **" + transaction.price + "** 🍅\n";
    resp += "From: **" + transaction.from + "**\n";
    resp += "To: **" + (transaction.to? transaction.to : "<BOT>") + "**\n";
    if(transaction.status == "auction") resp += "This is an **auction** transaction\n";
    else {
        resp += "On server: **" + transaction.guild + "**\n";
        resp += "Status: **" + transaction.status + "**\n";
    }

    callback(utils.formatInfo(null, "Transaction [" + transaction.id + "] " + timediff, resp));
}

function gets(user, callback) {
    collection.find({ to_id: user.id, status: "confirmed" }).sort({ time: -1 }).limit(20).toArray((err, res) => {
        if (!res || res.length == 0)
            return callback(utils.formatWarning(user, null, "can't find recent transactions recieved."));

        let resp = formatTransactions(res, user.id);
        callback(utils.formatInfo(null, "Recent transactions", resp));
    });
}

function sends(user, callback) {
    collection.find({ from_id: user.id, status: "confirmed" }).sort({ time: -1 }).limit(20).toArray((err, res) => {
        if (!res || res.length == 0) 
            return callback(utils.formatWarning(user, null, "can't find recent transactions sent."));
        
        let resp = formatTransactions(res, user.id);
        callback(utils.formatInfo(null, "Recent transactions", resp));
    });
}

function pending(user, callback) {
    collection.find({ to_id: user.id, status: "pending" }).sort({ time: 1 }).limit(20).toArray((err, res) => {
        if (!res || res.length == 0) 
            return callback(utils.formatWarning(user, null, "can't find any incoming transactions"));
        
        let resp = formatTransactions(res, user.id);
        callback(utils.formatInfo(null, "Incoming transactions", resp));
    });
}

function all(user, callback) {
    collection.find({ $or: [{ to_id: user.id }, { from_id: user.id }] }).sort({ time: -1 }).limit(20).toArray((err, res) => {
        if (!res || res.length == 0) 
            return callback(utils.formatWarning(user, null, "can't find recent transactions."));

        let resp = formatTransactions(res, user.id);
        callback(utils.formatInfo(null, "Recent transactions", resp));
    });
}

async function confirm(user, args, callback) {
    if(!args || args.length == 0)
        return callback(utils.formatError(user, null, "please specify transaction ID"));

    let transactionId = args[0];
    let transaction = await collection.findOne({ id: transactionId, status: "pending", $or: [{from_id: user.id}, {to_id: user.id}] });
    if(!transaction) return callback(utils.formatError(user, null, "can't find transaction with ID '" + transactionId + "'"));
    
    if(userHandlingList.includes(user.id)) return callback(utils.formatError(user, "Busy", "another transaction is being handled, try again."));
    
    userHandlingList.push(user.id);
    if(transaction.to_id && transaction.to_id == user.id) {
        userHandlingList.push(transaction.from_id);
    }

    try {
        await _confirm(user, transaction, callback);
    } finally {
        let i = userHandlingList.indexOf(user.id);
        if(i > -1) userHandlingList.splice(i, 1);
        if(transaction.to_id && transaction.to_id == user.id) {
            let i = userHandlingList.indexOf(transaction.from_id);
            if(i > -1) userHandlingList.splice(i, 1);
        }
    }
}

async function _confirm(user, transaction, callback) {
    let name = utils.getFullCard(transaction.card);

    //Sell to bot
    if(!transaction.to_id && transaction.from_id == user.id) {
        let dbUser = await ucollection.findOne({discord_id: transaction.from_id});
        let pullResult = await dbmanager.pullCard(user.id, transaction.card);

        if(!pullResult) {
            await collection.update({ _id: transaction._id }, {$set: {status: "declined"}});
            react.removeExisting(user.id, true);
            return callback(utils.formatError(user, "Unable to sell", "card that you want to sell was not found in your collection"));
        }

        await ucollection.update(
            { discord_id: user.id },
            { $inc: {exp: transaction.price} });

        await collection.update({ _id: transaction._id }, {$set: {status: "confirmed"}});
        react.removeExisting(user.id, true);
        return callback(utils.formatConfirm(user, "Card sold to bot", "you sold **" + name + "** for **" + transaction.price + "** 🍅"));

        //report(dbUser, null, match);
        // mongodb.collection('users').update(
        //     { discord_id: user.id }, {$set: {dailystats: dbUser.dailystats}}
        // );
    }

    //Sell to user
    if(transaction.to_id == user.id) {
        let fromUser = await ucollection.findOne({discord_id: transaction.from_id});
        let toUser = await ucollection.findOne({discord_id: transaction.to_id});

        if(toUser.exp < 0) 
            return callback(utils.formatError(user, null, "please pay off your debt before accepting trades. Your balance is now **" 
                + Math.round(toUser.exp) + "** 🍅"));

        if(toUser.exp - transaction.price < -2000)
            return callback(utils.formatError(user, null, "you can't go more than **2000**🍅 debt! You need at least **" 
                + Math.round(transaction.price - (toUser.exp + 2000)) 
                + "** more 🍅 to confirm this transaction"));

        transaction.card.fav = false;

        let pullResult = await dbmanager.pullCard(transaction.from_id, transaction.card);
        if(!pullResult) {
            react.removeExisting(user.id, true);
            await collection.update({id: transactionId}, {$set: {status: "declined"}});
            return callback(utils.formatError(user, "Unable to sell", "target card was not found in seller's collection"));
        }

        await dbmanager.pushCard(transaction.to_id, transaction.card);
        await ucollection.update(
                { discord_id: fromUser.discord_id },
                { $inc: {exp: transaction.price}});
        await ucollection.update(
                { discord_id: toUser.discord_id },
                { $inc: {exp: -transaction.price}});
        await collection.update({ _id: transaction._id }, {$set: {status: "confirmed"}});

        react.removeExisting(user.id, true);
        return callback(utils.formatConfirm(null, "Card sold to " + toUser.username, 
            "**" + fromUser.username + "** sold **" + name + "** to **" + toUser.username + "** for **" + transaction.price + "** 🍅"));
    }

    return callback(utils.formatError(user, null, "you have no rights to confirm this transaction"));
}

async function decline(user, args, callback) {
    if(!args || args.length == 0)
        return callback(utils.formatError(user, null, "please specify transaction ID"));

    let transactionId = args[0];
    let transaction = await collection.findOne({ id: transactionId, status: "pending", $or: [{from_id: user.id}, {to_id: user.id}] });
    if(!transaction) return callback(utils.formatError(user, null, "can't find transaction with ID '" + transactionId + "'"));

    if((transaction.to_id == user.id) || (transaction.from_id == user.id)) {
        react.removeExisting(user.id, true);
        await collection.update({ _id: transaction._id }, {$set: {status: "declined"}});
        return callback(utils.formatConfirm(user, null, 
            "transaction **[" + transaction.id + "]** was declined"));
    }

    return callback(utils.formatError(user, null, "you have no rights to decline this transaction"));
}

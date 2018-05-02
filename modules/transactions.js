module.exports = {
    processRequest, connect
}

var mongodb, collection, ucollection;
const fs = require('fs');
const utils = require('./localutils.js');

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
        case "confirm":
            confirm(user, args, callback);
            break;
        case "decline":
            decline(user, args, callback);
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
        let mins = utils.getMinutesDifference(trans.time);
        let hrs = utils.getHoursDifference(trans.time);
        let timediff = (hrs < 1) ? (mins + "m") : (hrs + "h");
        if (hrs < 1 && mins < 1) timediff = "just now";
        let isget = trans.to_id === userid;
        resp += "[" + timediff + "] ";
        resp += isget ? "<–" : "–>";
        resp += " **" + (trans.exp > -1 ? (trans.exp + "🍅") : utils.toTitleCase(trans.card.name.replace(/_/g, " "))) + "** ";
        resp += isget ? "from **" + trans.from + "**" : "to **" + trans.to + "**";
        resp += " in **" + trans.guild + "**\n";
    });

    return resp;
}

function gets(user, callback) {
    collection.find({ to_id: user.id }).sort({ time: -1 }).limit(20).toArray((err, res) => {
        if (!res || res.length == 0)
            return callback(utils.formatWarning(user, null, "can't find recent transactions recieved."));

        let resp = formatTransactions(res, user.id);
        callback(utils.formatInfo(null, "Recent transactions", resp));
    });
}

function sends(user, callback) {
    collection.find({ from_id: user.id }).sort({ time: -1 }).limit(20).toArray((err, res) => {
        if (!res || res.length == 0) 
            return callback(utils.formatWarning(user, null, "can't find recent transactions sent."));
        
        let resp = formatTransactions(res, user.id);
        callback(utils.formatInfo(null, "Recent transactions", resp));
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

function confirm(user, transactionId, callback) {
    if(!transactionId || transactionId.length == 0)
        return callback(utils.formatError(user, null, "please specify transaction ID"));

    collection.findOne({ transId: transactionId[0] }).then((err, res) => {
        if(!res) return callback(utils.formatError(user, null, "can't find transaction with that ID"));

        if(!res.to_id) {
            //sell to bot
            return;
        }

        if(res.to_id == user.id) {
            ucollection.find({$in: [res.from_id, res.to_id]}).then((err, res) => {

            });
        }
    });

    /*
    dbUser.cards = removeCardFromUser(dbUser.cards, cards);
    users.update(
            { discord_id: user.id },
            {
                $set: {cards: dbUser.cards },
                $inc: {exp: exp}
            }
        ).then(e => {
            let name = utils.toTitleCase(match.name.replace(/_/g, " "));
            callback(utils.formatConfirm(user, "Card sold to bot", "you sold **" + name + "** for **" + exp + "** 🍅"));
            report(dbUser, null, match);
        mongodb.collection('users').update(
            { discord_id: user.id }, {$set: {dailystats: dbUser.dailystats}}
        );
    });*/
}

function decline(user, transactionId, callback) {
    if(!transactionId || transactionId.length == 0)
        return callback(utils.formatError(user, null, "please specify transaction ID"));


}
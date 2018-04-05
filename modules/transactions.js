module.exports = {
    processRequest, connect
}

var mongodb, collection;
const fs = require('fs');
const utils = require('./localutils.js');

function connect(db) {
    mongodb = db;
}

function processRequest(user, cmd, args, callback) {
    var req = args.shift();
    if (cmd !== "trans" && cmd !== "transactions") {
        req = cmd;
    }

    switch (req) {
        case "got":
        case "gets":
            gets(user, callback);
            break;
        case "sent":
        case "sends":
            sends(user, callback);
            break;
        default:
            all(user, callback);
            break;
    }
}

function formatTransactions(res, userid) {
    let count = 0;
    let resp = "";
    try {
        res.map(trans => {
            if (count >= 20) throw BreakException;
            let mins = utils.getMinutesDifference(trans.time);
            let hrs = utils.getHoursDifference(trans.time);
            let timediff = (hrs < 1) ? (mins + "m") : (hrs + "h");
            if (hrs < 1 && mins < 1) timediff = "just now";
            let isget = trans.to_id === userid;
            //«, »
            resp += "[" + timediff + "] ";
            resp += isget ? "«" : "»";
            resp += " **" + (trans.exp ? (trans.exp + "🍅") : utils.toTitleCase(trans.card.name.replace(/_/g, " "))) + "** ";
            resp += isget ? "from" : "to";
            resp += " **" + trans.from + "** in **" + trans.guild + "**\n";
            count++;
        });
    } catch (e) { }
    return resp;
}

function gets(user, callback) {
    let collection = mongodb.collection('transactions');
    collection.find({ to_id: user.id }).sort({ time: -1 }).toArray((err, res) => {
        if (!res || res.length == 0)
            return callback(utils.formatWarning(user, null, "Can't find recent transactions to you."));
        let resp = formatTransactions(res, user.id);
        callback(utils.formatInfo(null, "Recent transactions", resp));
    });
}

function sends(user, callback) {
    let collection = mongodb.collection('transactions');
    collection.find({ from_id: user.id }).sort({ time: -1 }).toArray((err, res) => {
        if (!res || res.length == 0)
            return callback(utils.formatWarning(user, null, "Can't find recent transactions from you."));
        let resp = formatTransactions(res, user.id);
        callback(utils.formatInfo(null, "Recent transactions", resp));
    });
}

function all(user, callback) {
    let collection = mongodb.collection('transactions');
    collection.find().sort({ time: -1 }).toArray((err, res) => {
        if (!res || res.length == 0)
            return callback(utils.formatWarning(user, null, "Can't find recent transactions."));
        let resp = formatTransactions(res, user.id);
        callback(utils.formatInfo(null, "Recent transactions", resp));
    });
}

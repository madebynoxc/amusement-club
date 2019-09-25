/*
 * This module handles reporting of suspicious player activity.
 * Reports may only be viewed in the auditchannel specified in settings/general.json.
 */

module.exports = {
    processRequest, connect
}

var mongodb;
const settings = require('../settings/general.json');
const utils = require('./localutils.js');
const dbmanager = require('./dbmanager.js');
const report1col = 'aucSellRate';
const report2col = 'overpricedAucs';
const report3col = 'aucReneges';

function connect(db, client, shard) {
    mongodb = db;
    bot = client;

    if(shard == 0) {
        purgeReport1Records();
        pruneOldRecords();
        setInterval(function() {purgeReport1Records();}, 1000 * 60 * 60 * 24 * 7);
        setInterval(function() {pruneOldRecords();}, 1000 * 60 * 60 * 12);
    }
}

function processRequest(user, args, channelID, callback) {
    if ( channelID == settings.auditchannel ) {
        let command = args.shift();
        switch(command) {
            case 'reports':
            case 'report':
                report(args, callback);
                break;
        }
    } else {callback("You can only do that in the audit channel.");}
}

async function report(args, callback) {
    let report = args.shift();
    let out = "";
    let docs;
    switch(report) {
        case '1':
            out += "Anti-Fraud Report 1\n"+
                "**Players who sell too easily at auction**\n"+
                "sold% - sold - unsold - discord ID\n"
            let docs1 = await mongodb.collection(report1col).aggregate([
                    {$match:{"unsold":{$exists:false}, "sold":{$gt:7}}},
                    {$project: 
                        {
                            "discord_id":"$discord_id",
                            "sellRate": "1",
                            "sold":"$sold",
                            "unsold":"0"
                        }
                    },
                    {"$sort": {"sold": -1}},
                    {"$limit": 20}
            ]).toArray();
            let docs2 = await mongodb.collection(report1col).aggregate([
                    {$match:{"unsold":{$exists:true},"sold":{$gt:7}}},
                    {$project: 
                        {
                            "discord_id":"$discord_id",
                            "sellRate": {$divide: ["$sold", {$add: ["$sold", "$unsold"]}]},
                            "sold":"$sold",
                            "unsold":"$unsold"
                        }
                    },
                    {"$sort": {"sellRate": -1}},
                    {"$limit": 20}
            ]).toArray();
            docs = docs1.concat(docs2);
            docs = docs.slice(0,20);
            for ( let doc of docs ) {
                out += parseFloat(doc.sellRate).toFixed(1) *100 +'% - '+ doc.sold +' - '+ doc.unsold +' - <@'+ doc.discord_id +">\n";
            }
            callback(out);
            break;
        case '2':
            out += "Anti-Fraud Report 2\n"+
                "**Auctions that sold considerably above the eval price**\n"+
                "Times above eval - Auction ID - Date\n"
            docs = await mongodb.collection(report2col).aggregate([
                    {$match:{}},
                    {"$sort": {"factor": -1}},
                    {"$limit": 40}
            ]).toArray();
            for ( let doc of docs ) {
                out += parseFloat(doc.factor).toFixed(1) +' - '+ doc.aucId +' - '+ utils.formatDate(doc.date) +"\n";
            }
            if ( docs.length == 0 )
                out += "( no data yet )";
            callback(out);
            break;
        case '3':
            out += "Anti-Fraud Report 3\n"+
                "**Auction seller got their card back**\n"+
                "Player - Auction ID - Buyback Trans ID\n"
            docs = await mongodb.collection(report3col).find().toArray();
            for ( let doc of docs ) {
                out += '<@'+ doc.auction.from_id +'> - '+ doc.auction.id +' - '+ doc.buyBack.id +"\n";
            }
            if ( docs.length == 0 )
                out += "( no data yet )";
            callback(out);
            break;
        default:
            callback("Available reports:\n"+
                    "```1 - Players whose auctions always seem to have a buyer\n"+
                    "2 - Auctions that sold considerably above the eval price\n"+
                    "3 - Auction seller got their card back\n"+
                    "x - Suspected slave accounts\n"+
                    "x - Suspected tomato transfers from alt account\n"+
                    "x - Auc bidders that respond too fast (bots?)```");
            break;
    }
}

// Removes all records in report one. Called periodically.
async function purgeReport1Records() {
    console.log("Purging data for fraud report 1");
    mongodb.collection(report1col)
        .remove()
        .catch(function(e) {
            console.log("problem purging old anti-fraud data from `aucSellRate`:\n"+ e);
        });
}

// Reports with date metadata have their records pruned by this function.
async function pruneOldRecords() {
    console.log("Pruning data for fraud report 2");
    mongodb.collection(report2col)
        .remove({"date":{$lt:new Date(new Date() -(1000*60*60*24*7))}})
        .catch(function(e) {
            console.log("problem pruning old anti-fraud data from `overpricedAucs`:\n"+ e);
        });
    console.log("Pruning data for fraud report 3");
    mongodb.collection(report3col)
        .remove({"buyBack.time":{$lt:new Date(new Date() -(1000*60*60*24*7))}})
        .catch(function(e) {
            console.log("problem pruning old anti-fraud data from `overpricedAucs`:\n"+ e);
        });
}



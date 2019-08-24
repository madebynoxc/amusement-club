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

function connect(db, client, shard) {
    mongodb = db;
    bot = client;
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
    switch(report) {
        case '1':
            out += "Anti-Fraud Report 1\n"+
                "**Players who sell too easily at auction**\n"+
                "sold% - sold - unsold - discord ID\n"
            let docs1 = await mongodb.collection('aucSellRate').aggregate([
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
            let docs2 = await mongodb.collection('aucSellRate').aggregate([
                    {$match:{"unsold":{$exists:true},"sold":{$gt:7}}},
                    {$project: 
                        {
                            "discord_id":"$discord_id",
                            "sellRate": {$divide: ["$sold", "$unsold"]},
                            "sold":"$sold",
                            "unsold":"$unsold"
                        }
                    },
                    {"$sort": {"sellRate": -1}},
                    {"$limit": 20}
            ]).toArray();
            let docs = docs1.concat(docs2);
            docs = docs.slice(0,20);
            for ( let doc of docs ) {
                out += parseFloat(doc.sellRate).toFixed(1) +' - '+ doc.sold +' - '+ doc.unsold +' - '+ doc.discord_id +"\n";
            }
            callback(out);
            break;
        default:
            callback("Available reports:\n"+
                    "```1 - Players whose auctions always seem to have a buyer\n"+
                    "x - Auctions that sold way above the eval price\n"+
                    "x - Auction seller got their card back\n"+
                    "x - Suspected slave accounts\n"+
                    "x - Suspected tomato transfers from alt account\n"+
                    "x - Auc bidders that respond too fast (bots?)```");
            break;
    }
}

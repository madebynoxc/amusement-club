module.exports = {
    processRequest, connect //, checkFraudLogs
}

var mongodb;
const settings = require('../settings/general.json');
const utils = require('./localutils.js');
const dbmanager = require('./dbmanager.js');

function connect(db, client, shard) {
    mongodb = db;
    bot = client;

    if(shard == 0) {
        //setInterval(function() {checkFraudLogs(client);}, 5000);
    }
}

function processRequest(user, args, channelID, callback) {
    if ( channelID == settings.auditchannel ) {
        let command = args.shift();
        switch(command) {
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
        case 'aucSellRate':
            out += "Anti-Fraud Report 1 (aucSellRate)\n"+
                "**Players who sell too easily at auction**\n";
            let docs = await mongodb.collection("aucSellRate").aggregate([
                    {$match:{}},
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
            out += JSON.stringify(docs);
            callback(out);
            break;
        default:
            callback("unknown report requested.");
    }
}

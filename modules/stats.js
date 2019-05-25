module.exports = {
    processRequest, connect
}

var mongodb, ucollection, ccollection, client;
const fs = require('fs');
const logger = require('./log.js');
const utils = require('./localutils.js');
const os = require('os');
const collections = require('./collections.js');

function connect(db, bot) {
    mongodb = db;
    client = bot;
    ucollection = db.collection('users');
    ccollection = db.collection('cards');
    pcollection = db.collection('promocards');
}

function processRequest(args, callback) {
    var req = args.shift();
    switch(req) {
        case undefined:
            general(callback);
            break;
        case "cards":
            cards(callback);
            break;
        case "hero":
            hero(callback);
            break;
    }
}

function general(callback) {
    let date = new Date();
    let lastWeek = new Date(date.setDate(date.getDate() - 7));
    ucollection.count({'cards.1': {$exists: true}}).then(ucc => {
        ccollection.count().then(ccc => {
            pcollection.count().then(pcc => {
                ucollection.count({lastdaily: {$gt: lastWeek}}).then(aucc => {
                    let res = "";
                    res += "Overall users: **" + ucc + "**\n"; 
                    res += "Overall servers: **" + Object.keys(client.servers).length + "**\n";
                    res += "Active users (7d): **" + aucc + "**\n";
                    res += "Overall cards: **" + (ccc + pcc) + "**\n"; 
                    res += "OS Uptime: **" + Math.floor(os.uptime()/3600) + "** hours\n"; 
                    res += "RAM used: **" + Math.floor(os.totalmem() * .0000001)  + "mb**\n";
                    res += "Running **Ubuntu 18.04.1 LTS | MongoDB 4.0.4 | NodeJS 8.10.0**";
                    callback(utils.formatInfo(null, "General bot statistics", res));
                });
            });
        });
    });
    
}

function cards(callback) {
    let promises = [];
    promises.push(ccollection.count());
    promises.push(pcollection.count());
    promises.push(ccollection.find({animated: true}).count());
    promises.push(ccollection.find({craft: true}).count());
    collections.getCollections().then(list => {
        /*for(i=0; i<list.length; i++) {
            let col = list[i];
            if(col.special) 
                promises.push(pcollection.find({collection: col.id}).count());
            else promises.push(ccollection.find({collection: col.id}).count());
        }*/
        for(i=0; i<=5; i++) 
            promises.push(ccollection.find({level: i}).count());

        Promise.all(promises).then(v => {
            let res = "";
            //res = "__**General cards statistics**__\n";
            res += "Overall cards: **" + (v[0] + v[1]) + "**\n"; 
            res += "Overall collections: **" + list.length + "**\n\n";
            for(i=1; i<=5; i++) { 
                res += i.toString() + '-star: **';
                res += v[i + 4] + "**\n";
            }

            res += "\nAnimated: **" + v[2] + "**";
            res += "\nCraft: **" + v[3] + "**";
            callback(utils.formatInfo(null, "General cards statistics", res));
        });
    });
}

function hero(callback) {
    let promises = [];
    promises.push(ucollection.count({'cards.1': {$exists: true}}));
    promises.push(ucollection.count({hero: {$exists: true}}));
    promises.push(ucollection.count({'hero.name': 'Toshino Kyoko'}));
    promises.push(ucollection.count({'hero.name': 'Funami Yui'}));
    promises.push(ucollection.count({'hero.name': 'Akaza Akari'}));
    promises.push(ucollection.count({'hero.name': 'Yoshikawa Chinatsu'}));
    Promise.all(promises).then(v => {
        let res = "";
        res += "Heroes have: **" + v[1] + "** (";
        res += Math.floor((v[1]/v[0]) * 100) + "% of users)\n";
        res += "Toshino Kyoko: **" 
        res += v[2] + " users**\n";
        res += "Funami Yui: **" 
        res += v[3] + " users**\n";
        res += "Akaza Akari: **" 
        res += v[4] + " users**\n";
        res += "Yoshikawa Chinatsu: **" 
        res += v[5] + " users**\n";
        callback(utils.formatInfo(null, "General hero statistics", res));
    });
}

module.exports = {
    processRequest, connect
}

var mongodb, ucollection, ccollection;
const fs = require('fs');
const logger = require('./log.js');
const utils = require('./localutils.js');
const os = require('os');

var collections = [];
fs.readdir('./cards', (err, items) => {
    if(err) console.log(err);
    collections = items;
});

function connect(db) {
    mongodb = db;
    ucollection = db.collection('users');
    ccollection = db.collection('cards');
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
    ucollection.count().then(ucc => {
        ccollection.count().then(ccc => {
            ucollection.find({lastdaily: {$exists:true}}).count().then(aucc => {
                res = "__**General bot statistics**__\n";
                res += "Overall users: **" + ucc + "**\n"; 
                res += "Active users: **" + aucc + "**\n";
                res += "Overall cards: **" + ccc + "**\n"; 
                res += "Used fandoms/collections: **"; 
                for(i in collections) res += collections[i] + ', ';
                res += "**\n";
                res += "Load average: **" + os.loadavg()[2] + "%**\n";
                res += "OS Uptime: **" + Math.floor(os.uptime()/3600) + "** hours\n"; 
                res += "Running **" + os.type() + ' : ' + os.platform() + "**";
                callback(res);
            });
        });
    });
    
}

function cards(callback) {
    let promises = [];
    promises.push(ccollection.count());
    promises.push(ccollection.find({animated: true}).count());
    promises.push(ccollection.find({craft: true}).count());
    for(i=0; i<collections.length; i++)  
        promises.push(ccollection.find({collection: collections[i]}).count());
    for(i=0; i<=5; i++) 
        promises.push(ccollection.find({level: i}).count());

    Promise.all(promises).then(v => {
        res = "__**General cards statistics**__\n";
        res += "Overall cards: **" + v[0] + "**\n"; 
        res += "By collection: ";
        for(i=0; i<collections.length; i++) { 
            res += collections[i] + ' -- **';
            res += v[i + 3] + "**";
            if(i + 1 < collections.length) res += ' | ';
        }
        res += "\nBy level: ";
        for(i=1; i<=5; i++) { 
            res += i.toString() + ' -- **';
            res += v[3 + collections.length + i] + "**";
            if(i < 5) res += ' | ';
        }
        res += "\nAnimated: **" + v[1] + "**";
        res += "\nCraft: **" + v[2] + "**";
        callback(res);
    });
}

function hero(callback) {
    let promises = [];
    promises.push(ucollection.count());
    promises.push(ucollection.find({hero: {$exists:true}}).count());
    promises.push(ucollection.find({'hero.name': 'Toshino Kyoko'}).count());
    promises.push(ucollection.find({'hero.name': 'Funami Yui'}).count());
    promises.push(ucollection.find({'hero.name': 'Akaza Akari'}).count());
    promises.push(ucollection.find({'hero.name': 'Yoshikawa Chinatsu'}).count());
    Promise.all(promises).then(v => {
        res = "__**General hero statistics**__\n";
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
        callback(res);
    });
}
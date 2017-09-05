module.exports = {
    processRequest, connect
}

var mongodb, ucollection;
const fs = require('fs');
const logger = require('./log.js');
const utils = require('./localutils.js');
const forge = require('./forge.js');

function connect(db) {
    mongodb = db;
    ucollection = db.collection('users');
}

function processRequest(userID, args, callback) {
    ucollection.findOne({ discord_id: userID }).then((dbUser) => {
        if(!dbUser) return;

        var req = args.shift();
        switch(req) {
            case undefined:
                showInventory(dbUser, callback);
            case "info":
                if(args.length > 0)
                    getInfo(dbUser, args.join('_'), callback);
                break;
        }
    }).catch(e => logger.error(e));
}

function getInfo(user, name, callback) {
    if(!user.inventory || user.inventory.length == 0) {
        callback("**" + user.username + "**, your inventory is **empty**");
        return;
    }

    let item = user.inventory.filter(c => c.name.includes(name))[0];
    if(item){
        switch(item.type){
            case 'craft':
                forge.getInfo(user, name, callback, true);
                break;
        }
    }
}

function showInventory(user, callback) {
    if(!user.inventory || user.inventory.length == 0) {
        callback("**" + user.username + "**, your inventory is **empty**");
        return;
    }

    let resp = "**" + user.username + "**, your inventory:\n";
    for(i in user.inventory) {
        resp += (i + 1) + ". ";
        resp += "[" + user.inventory[i].type + "]  ";
        resp += utils.toTitleCase(user.inventory[i].name.replace(/_/g, " "));
        resp += "\n";
    }
    callback(resp);
}
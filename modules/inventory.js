module.exports = {
    processRequest, connect, useItem
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
            case "use":
                if(args.length > 0)
                    useItem(dbUser, args, callback);
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
        return;
    }

    callback("**" + user.username + "**, you don't have item named **" + item + "**");
}

function showInventory(user, callback) {
    if(!user.inventory || user.inventory.length == 0) {
        callback("**" + user.username + "**, your inventory is **empty**");
        return;
    }

    let resp = "**" + user.username + "**, your inventory:\n";
    for(let i=0; i<user.inventory.length; i++) {
        resp += (i+1).toString() + ". ";
        resp += "[" + user.inventory[i].type + "]  ";
        resp += utils.toTitleCase(user.inventory[i].name.replace(/_/g, " "));
        resp += "\n";
    }
    callback(resp);
}

function useItem (user, args, callback) {
    if(!user.inventory || user.inventory.length == 0) {
        callback("**" + user.username + "**, your inventory is **empty**");
        return;
    }

    let passArgs = args.join('_').split(',');
    console.log(passArgs);
    let name = passArgs[0];
    let item = user.inventory.filter(i => i.name.includes(name))[0];
    if(item) {
        switch(item.type){
            case 'craft':
                forge.useCard(user, item.name, passArgs[1], callback);
                break;
        }
        return;
    }

    callback("**" + user.username + "**, you don't have item named **" + name + "**");
}
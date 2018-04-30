module.exports = {
    processRequest, connect, useItem, has
}

var mongodb, ucollection;
const fs = require('fs');
const logger = require('./log.js');
const utils = require('./localutils.js');
const forge = require('./forge.js');
const heroes = require('./heroes.js');

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

    let item = user.inventory.filter(c => c.name.toLowerCase().includes(name))[0];
    if(item){
        switch(item.type){
            case 'craft':
                forge.getInfo(user, name, callback, true);
                break;
            case 'crystal':
                callback("**" + user.username + "**, combine crystals to get unique cards.\nTo get card recipe use `->res [card name]`\n"
                    + "To get name of possible card of combination use `->res [*crystal1, *crystal2] ...` e.g. `->res *blue, *magenta, *green`");
        }
        return;
    }

    callback("**" + user.username + "**, you don't have item named **" + name + "**");
}

function has(user, name) {
    if(user.inventory)
        return user.inventory.filter(i => i.name == name).length > 0;
    return false;
}

function showInventory(user, callback) {
    if(!user.inventory || user.inventory.length == 0) {
        callback("**" + user.username + "**, your inventory is **empty**");
        return;
    }

    let resp = "**" + user.username + "**, your inventory:\n";
    let cnt = 1;
    for(let i=0; i<user.inventory.length; i++) {
        if(user.inventory[i].type == "crystal") continue;
        resp += cnt.toString() + ". ";
        resp += "[" + user.inventory[i].type + "]  ";
        resp += utils.toTitleCase(user.inventory[i].name.replace(/_/g, " "));
        if(user.inventory[i].amount > 1) resp += " (x" + user.inventory[i].amount + ")";
        if(user.inventory[i].lastused) {
            let cooldown = heroes.getHeroEffect(user, 'cooldown', user.inventory[i].cooldown) - utils.getHoursDifference(user.inventory[i].lastused);
            if(cooldown && cooldown > 0){
                if(cooldown == 1) {
                    cooldown = 60 - (utils.getMinutesDifference(user.inventory[i].lastused) % 60);
                    resp += " 🕐 " + cooldown + "m"
                } else {
                    resp += " 🕐 " + cooldown + "h"
                }
            } else {
                resp += " 🕐 " + "Ready!"
            }
        }
        resp += "\n";
        cnt++;
    }
    callback(resp);
}

function useItem (user, args, callback) {
    if(!user.inventory || user.inventory.length == 0) {
        callback("**" + user.username + "**, your inventory is **empty**");
        return;
    }

    let passArgs = args.join('_').split(',');
    let name = passArgs[0];
    let item = user.inventory.filter(i => i.name.includes(name))[0];
    let isComplete = false;
    if(item) {
        if(item.lastused) {
            let cooldown = heroes.getHeroEffect(user, 'cooldown', item.cooldown) - utils.getHoursDifference(item.lastused);
            let itemname = utils.toTitleCase(item.name.replace(/_/g, " "));
            if(cooldown && cooldown > 0){
                callback("**" + user.username + "**, the item **" + itemname
                + "** is on cooldown for **" + cooldown + "** more hours");
                return;
            }
        }

        passArgs.shift();
        switch(item.type) {
            case 'craft':
                isComplete = forge.useCard(user, item.name, passArgs? passArgs.join(','):null, callback);
                break;
        }

        if(isComplete) {
            item.lastused = new Date();
            ucollection.update( 
                { discord_id: user.discord_id },
                { $set: {inventory: user.inventory} }
            ).then(u => {callback("Item was used and now on cooldown")});
        } else {
            callback("**" + user.username + "**, impossible to use this item D:");
        }
        return;
    }

    callback("**" + user.username + "**, you don't have item named **" + name + "**");
}
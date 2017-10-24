module.exports = {
    processRequest, connect
}

var mongodb, ucollection;
const fs = require('fs');
const _ = require('lodash');
const waifus = require('../waifu/waifus.json');
const logger = require('./log.js');
const utils = require('./localutils.js');
const dbManager = require('./dbmanager.js');
const heroes = require('./hero.js');
const Danbooru = require('danbooru')

var booru = new Danbooru.Safebooru();

function connect(db) {
    mongodb = db;
    ucollection = db.collection('users');
}

function processRequest(userID, args, callback) {
    ucollection.findOne({ discord_id: userID }).then((dbUser) => {
        if(!dbUser) return;

        var req = args.shift();
        switch(req) {
            case "daily":
                getDaily(dbUser, callback);
                break;
            case "pat":
            case "pet":
                patWaifu(dbUser, args, callback);
                break;            
            default:
                args.unshift(req)
                showWaifu(dbUser, args, callback);
                break;
        }
    }).catch(e => logger.error(e));
}

function getDaily(user, callback) {
    let rand = _.sample(waifus);
    if(!user.hero || user.waifus && parseFloat(heroes.getHeroLevel(user.hero)) <= user.waifus) {
        rand = _.sample(user.waifus);
        callback("**" + user.username + "**, you are out of waifu slots! Higher hero level gives you more slots");
        return;
    }

    if(user.waifus && user.waifus.includes(rand)) {
        ucollection.update({discord_id: user.discord_id}, $inc{"waifus"});
    } else {
        ucollection.update({discord_id: user.discord_id}, {})    
    }
    
}

function showWaifu(user, name, callback) {

}

function getImage(name, callback) {
    booru.posts({
      limit: 100,
      tags: name.replace(/\s/g, '_') + " 1girl",
      random: true
    }).then(r => callback("https://safebooru.donmai.us" + _.sample(r.sort(dbManager.dynamicSort('up_score')).slice(0, 10)).file_url));
}

function patWaifu(user, name, callback) {
    
}

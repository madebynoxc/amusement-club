module.exports = {
    connect, processRequest
}

var mongodb, ucollection;
const logger = require('./log.js');
const dbManager = require('./dbmanager.js');
const heroDB = require('./heroes.json');

function connect(db) {
    mongodb = db;
    ucollection = db.collection('users');
}

function processRequest(userID, args, callback) {
    ucollection.findOne({ discord_id: userID }).then((dbUser) => {
        if(!dbUser) return;

        var req = args[0];
        switch(req) {
            case "list":
                getHeroes(dbUser, callback);
                break;
            case "info":
                getInfo(dbUser, callback);
                break;
            default:
                getHero(dbUser, callback);
        }
    });
}

function getHero(dbUser, callback) {
    var h = dbUser.hero;
    if(!h) {
        let stars = dbManager.countCardLevels(dbUser.cards);
        var msg = "**" + dbUser.username + "**, you have no any hero yet. \n";
        if(stars > 75) msg += "To choose one, use `->hero list`";
        else msg += "You can get one once you have more than 75 \u2B50 stars!";
        callback(msg);
        return;
    }

    callback(h.fraction + " **" + h.name + "** arrives!", { file: h.name.toLower().replace(' ', '_') });
}

function getHeroes(dbUser, callback) {
    ucollection.findOne({ discord_id: userID }).then((dbUser) => {
        if(!dbUser) return;

        let stars = dbManager.countCardLevels(dbUser.cards);
        if(stars < 75) {
            callback("**" + dbUser.username + "**, you should have at least 75 \u2B50 stars to have a hero.\n"
                    + "You have now " + stars + " \u2B50 stars.");
            return;
        }

        
    }).catch(e => logger.error(e));
}
module.exports = {
    processRequest, connect
}

var mongodb, bot, ucollection;
const utils = require('./localutils');
const settings = require('../settings/general.json');

function connect(db, client) {
    mongodb = db;
    bot = client;
    ucollection = db.collection("users");
}

function processRequest(user, channelID, args, callback) {
    let command = args.shift();
    switch(command) {
        case 'embed':
            embed(args, callback);
            break;
        case 'warn':
            warnUser(user, args, callback);
            break;
        case 'ban':
            banUser(args, callback);
            break;
    }
}

function embed(args, callback) {
    let link = args[0].replace('<', '').replace('>', '');
    console.log(utils.formatImage(null, null, "Formatted sample", link));
    
    callback(utils.formatImage(null, null, "Formatted sample", link));
}

async function warnUser(user, args, callback) {
    let parse = utils.getUserID(args);
    if(!parse.id)
        return callback(utils.formatError(user, null, "please provide user ID"));

    let res = await ucollection.update({ "discord_id": parse.id}, { $inc: { warnings: 1 }});
    
    if(res.result.nModified > 0) {
        callback(utils.formatConfirm(user, null, `user was warned`));
    } else 
        callback(utils.formatError(user, null, `user with that ID was not found`));

}

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

async function processRequest(user, channelID, args, callback) {
    let command = args.shift();
    switch(command) {
        case 'embed':
            embed(args, callback);
            break;
        case 'warn':
            await warnUser(user, args, callback);
            break;
        case 'ban':
            banUser(args, callback);
            break;
        case 'embargo':
            embargoUser(args, callback);
            break;
        case 'daily':
            resetDaily(args, callback);
            break;
    }
}

async function resetDaily(args, callback) {
    let parse = utils.getUserID(args);
    if(!parse.id)
        return callback(utils.formatError(null, null, "please provide user ID"));

    let targetUser = (await ucollection.findOne({ "discord_id": parse.id }));
    if(!targetUser)
        return callback(utils.formatError(null, null, `user with that ID was not found`));

    await ucollection.update({discord_id: parse.id}, {$unset: {lastdaily: 1}});
    callback(utils.formatConfirm(null, null, "Daily for **"+ 
            targetUser.username +"** "+ " was reset"));
}

async function embargoUser(args, callback) {
    let undo = false;
    if ( args[0] == 'lift' ) {
        undo = true;
        args.shift();
    }
    let parse = utils.getUserID(args);
    if(!parse.id)
        return callback(utils.formatError(null, null, "please provide user ID"));

    let targetUser = (await ucollection.findOne({ "discord_id": parse.id }));
    if(!targetUser)
        return callback(utils.formatError(null, null, `user with that ID was not found`));

    targetUser.embargo = !undo;
    ucollection.save(targetUser).then(e => {
        let out = "can no longer participate in auctions or sales.";
        if ( undo )
            out = "can once again participate in auctions and sales.";
        callback(utils.formatConfirm(null, "Embargo Enacted", "**"+ 
            targetUser.username +"** "+ out));
    }).catch(e=> {
        callback(utils.formatError(user, "Command could not be executed \n", e));
    });
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

    let targetUser = (await ucollection.findOne({ "discord_id": parse.id }));
    if(!targetUser)
        return callback(utils.formatError(user, null, `user with that ID was not found`));

    await ucollection.update({ "discord_id": parse.id}, { $inc: { warnings: 1 }});
    sendDM(parse.id, utils.formatWarning(targetUser, "Rule violation warning", parse.input), isSent => {
        if(!isSent) 
            return callback(utils.formatError(user, null, `failed to send a message to **${targetUser.username}**`));

        return callback(utils.formatConfirm(user, null, `user **${targetUser.username}** was warned\n"
            + "This was a warning **#${targetUser.warnings? targetUser.warnings + 1 : 1}**`));
    });
}

function sendDM(userId, embed, callback) {
    bot.createDMChannel(userId, (createErr, newChannel) => {
        if(!newChannel)
            return false;
        
        bot.sendMessage({to: newChannel.id, embed: embed}, (err, resp) => {
            return !err;
        });
    });
}

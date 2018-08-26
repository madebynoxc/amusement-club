module.exports = {
    processRequest, connect, check, getByID
}

var mongodb, bot, scollection, ucollection;
const _ = require('lodash');
const utils = require('./localutils');
const collections = require('./collections');
const dbManager = require('./dbmanager');
const settings = require('../settings/general.json');

function connect(db, client) {
    mongodb = db;
    bot = client;

    scollection = mongodb.collection("servers");
    ucollection = mongodb.collection("users");

    setOldGuilds();
}

function processRequest(user, server, channelID, args, callback) {
    let command = args.shift();
    switch(command) {
        case 'info':
            info(server, callback);
            break;
        case 'setbot':
            setbot(user, server.id, channelID, callback);
            break;
        case 'unsetbot':
            unsetbot(user, server.id, channelID, callback);
            break;
        case 'setprefix':
            setprefix(user, server.id, args, callback);
            break;
        case 'lock':
            lock(user, server.id, args, callback);
            break;
        case 'unlock':
            unlock(user, server.id, callback);
            break;
    }
}

async function getByID(serverID) {
    return scollection.findOne({id: serverID});
}

async function check(srv) {
    let guild = await getByID(srv.id);
    if(!guild) {
        guild = {
            id: srv.id, 
            owner: srv.owner_id,
            botChannels: [], 
            prefix: settings.botprefix
        };

        Object.keys(srv.channels).map((c, index) => {
            let chan = bot.channels[c];
            if(chan.name.includes('bot'))
                guild.botChannels.push(chan.id);
        });

        if(guild.botChannels.length == 0)
            bot.sendMessage({to: guild.owner, message: 
                "Dear owner of **" + srv.name + "**!\nThe bot channel on this server has not been found. "
                + "Please type `->server setbot` in channel where you want to use Amusement Club.\n"
                + "This is nessessary to avoid spam of bot commands in other channels. More details at `->help guild`" });
        /*else
            bot.sendMessage({to: guild.owner, message: 
                "Thank you for inviting Amusement Club to **" + srv.name + "**!\n"
                + "Please use `->help invite` to get information about setting up bot on your server.\n"
                + "`->help guild` will give you the list of possible owner-only commands that you can use." });*/

        scollection.insert(guild);

    } else if(guild.owner != srv.owner_id) {
        scollection.update({id: serverID}, {$set: {owner: srv.owner_id}});
    }
}

async function setbot(user, serverID, channelID, callback) {
    let guild = await getByID(serverID);
    let owner = bot.users[guild.owner];
    if(guild.owner == user.id || settings.admins.includes(user.id)) {
        if(guild.botChannels.includes(channelID))
            return callback(utils.formatError(user, null, "this channel is already marked as bot"));

        await scollection.update({id: serverID}, {$push: {botChannels: channelID}});
        return callback(utils.formatConfirm(user, null, "channel is now marked as bot"));
    }

    return callback(utils.formatError(user, null, "this operation can be performed only by server owner **" + owner.username + "**"));
}

async function unsetbot(user, serverID, channelID, callback) {
    let guild = await getByID(serverID);
    let owner = bot.users[guild.owner];
    if(guild.owner == user.id || settings.admins.includes(user.id)) {
        if(!guild.botChannels.includes(channelID))
            return callback(utils.formatError(user, null, "this is not a bot channel"));

        await scollection.update({id: serverID}, {$pull: {botChannels: channelID}});
        return callback(utils.formatConfirm(user, null, "removed bot permissions for this channel"));
    }

    return callback(utils.formatError(user, null, "this operation can be performed only by server owner **" + owner.username + "**"));
}

async function setprefix(user, serverID, args, callback) {
    let guild = await getByID(serverID);
    let owner = bot.users[guild.owner];
    let pref = args[0];
    if(guild.owner == user.id || settings.admins.includes(user.id)) {
        if(!pref)
            return callback(utils.formatError(user, null, "prefix can't be null"));

        if(pref.length > 3)
            return callback(utils.formatError(user, null, "prefix can't be longer than 3 characters"));

        await scollection.update({id: serverID}, {$set: {prefix: pref}});
        return callback(utils.formatConfirm(user, null, "set prefix to `" + pref + "`"));
    }

    return callback(utils.formatError(user, null, "this operation can be performed only by server owner **" + owner.username + "**"));
}

async function lock(user, serverID, args, callback) {
    let guild = await getByID(serverID);
    let owner = bot.users[guild.owner];
    let col = collections.parseCollection(args[0])[0];
    if(settings.admins.includes(user.id)) {
        if(!col)
            return callback(utils.formatError(user, "Failed", "can't find collection **" + args[0] + "**"));

        await scollection.update({id: serverID}, {$set: {lock: col.id}});
        return callback(utils.formatConfirm(user, null, "locked current server to **" + col.name + "**"));
    }
}

async function unlock(user, serverID, callback) {
    let guild = await getByID(serverID);
    let owner = bot.users[guild.owner];
    if(settings.admins.includes(user.id)) {
        await scollection.update({id: serverID}, {$unset: {lock: ""}});
        return callback(utils.formatConfirm(user, null, "unlocked current server"));
    }
}

async function info(srv, callback) {
    let guild = await getByID(srv.id);
    let members = Object.keys(srv.members);
    let playercount = await ucollection.count({discord_id: {$in: members}});
    let resp = "";
    let owner = bot.users[guild.owner];
    resp += `Owner: **${owner.username}#${owner.discriminator}**\n`;
    resp += `Players: **${playercount}/${members.length}**\n`;
    resp += `Prefix: **${guild.prefix}**\n`;

    if(guild.lock)
        resp += `Locked on: **${collections.getByID(guild.lock).name}**\n`;

    try {resp += `Bot channels: **${guild.botChannels.map(c => bot.channels[c].name).join(' | ')}**`;}
    catch(e) {}

    callback(utils.formatInfo(null, srv.name, resp));
}

async function setOldGuilds() {
    let list = require('../settings/servers.json')
    for (let i = 0; i < list.length; i++) {
        await scollection.update({id: list[i].guild_id}, 
            {$set: {lock: list[i].collection}});
    }
}

module.exports = {
    processRequest, connect, getStatus, checkStatus, checkOnJoin, getLink
}

var mongodb, ucollection, icollection, bot;
//const Discord = require('discord.js');
const logger = require('./log.js');
const utils = require('./localutils.js');
const settings = require('../settings/general.json');
const changelog = require('../help/updates.json');
const dbManager = require("./dbmanager.js");
const link = "https://discordapp.com/oauth2/authorize?client_id=340988108222758934&scope=bot&permissions=379969";

function connect(db, client) {
    mongodb = db;
    bot = client;
    ucollection = db.collection('users');
    icollection = db.collection('invites');
}

function getLink(user, callback) {
    return callback(utils.formatInfo(null, "Invite Amusement Club", "**BEFORE YOU INVITE**\n"
        + "Please, read terms and conditions of using bot on your server by running \n`->help invite`\n"
        + "After that [click here](" + link + ") to invite the bot."));
}

//ALL CODE BELOW IS NOT USED ANYMORE
function processRequest(user, message, args, callback) {
    var req = args.shift();
    switch(req) {
        case "status":
            getStatus(args[0], callback);
            break;
        case "list":
            //list(callback);
            break;
        case "ban":
            if(dbManager.isAdmin(user.id))
                banServer(args[0], callback);
            break;
        default:
            tryAdd(user, req, callback);
    }
}

function setInvited(srvID, callback) {
    icollection.findOne({server_id: srvID}).then(s => {
        if(s && s.status == 'pending') {
            icollection.update(
                {server_id: srvID},
                {$set: {status: "active"}}
            );
        } 

        if(callback) callback(s? s.status : null);
    }).catch(e => logger.error(e));
}

function checkOnJoin(guild) {
    let def = dbManager.getDefaultChannel(guild);
    let resp = new Discord.RichEmbed();
    resp.setColor(utils.colors.red);

    if(guild.member_count < 10) {
        resp.setTitle("Server is invalid");
        resp.setDescription("For technical reasons bot can't function on small servers.\n"
            + "Please, invite **Amusement Club** again when you have 10 or more members");
        if(def) send(def, resp, () => bot.leaveServer(guild.id));
        return;
    }

    setInvited(guild.id, t => {
        if(t == 'pending') {
            var msg = "**Amusement Club here!**\n"
                + "I am a card game bot that allows *you* to obtain some nice cards in your collection.\n"
                + "Get chance to win one of those below!\n"
                + "Type `->help` and get started";

            bot.uploadFile({to: def.id, message: msg, file: './invite.png'}, () => {
                for (var key in guild.channels) {
                    if(guild.channels[key].name.includes('bot')) return;
                }

                resp.setColor(utils.colors.yellow);
                resp.setTitle("Notice");
                resp.setDescription("This server has no any **bot** channel.\n"
                    + "In order to **Amusement Club** function properly, you need to have special channel "
                    + "that has 'bot' in the name.\n`(e.g. 'bot-commands', 'bot', 'bot_stuff', etc)`");
                send(def, resp);
            });
        }
        else if(t == 'banned') {
            resp.setTitle("Bot can't function on this server");
            resp.setDescription("This bot was banned from this server. **Amusement Club** will leave after this message");
            send(def, resp, () => bot.leaveServer(guild.id));
        }
        else if(t == null) {
            resp.setTitle("Bot is not registered!");
            resp.setDescription("Server administrator has to run `->invite [server_id]` in bot DMs\n"
                + "Run `->help invite` for more information");
            send(def, resp);
        }
    });
}

function send(channel, emb, clb) {
    bot.sendMessage({to: channel.id, embed: emb}, clb);
}

function checkStatus(message, guild, callback) {
    if(!guild) {
        callback(null);
        return;
    }

    icollection.findOne({server_id: guild.id}).then(s => {
        let resp = new Discord.RichEmbed();
        resp.setColor(utils.colors.red);
        resp.setTitle("Bot can't function on this server");

        if(s && s.status == "banned") {
            resp.setDescription("This bot was banned from this server. **Amusement Club** will leave after this message");
            bot.leaveServer(guild.id)
            return callback(resp);
        }

        if(!message.startsWith(settings.botprefix)
            || message.startsWith(settings.botprefix + 'invite')) {
            callback(null);
            return;
        }

        if(s) {
            if(s.status == "pending") {
                setInvited(guild.id);
                callback(null);
                return;
            } else {callback(null); return;}
        }
        else resp.setDescription("This bot is not registered on this server.\n"
            + "Please, ask server administrator to run `->invite [server_id]` in bot DM to add this server to bot's list");

        callback(resp);
    });
}

function tryAdd(author, srvID, callback) {
    let resp = new Discord.RichEmbed();
    if(!srvID) {
        resp.setColor(utils.colors.red);
        resp.setTitle("Usage");
        resp.setDescription("`->invite [server_id]`");
        callback(resp);
        return;
    }

    if(isNaN(srvID)) {
        resp.setColor(utils.colors.red);
        resp.setTitle("The [server_id] should be a number");
        resp.setDescription("To get it fast:\n"
            + "1. Go to Discord settings\n"
            + "2. Turn on 'Developer mode'\n"
            + "3. Right click on your server icon\n"
            + "4. Choose 'Copy ID'");
        callback(resp);
        return;
    }

    icollection.findOne({server_id: srvID}).then(s => {
        if(s && s.status == "pending") {
            let expHours = 20 - utils.getHoursDifference(s.created);
            resp.setColor(utils.colors.yellow);
            resp.setTitle("Can't add this server");

            if(expHours > 0) {
                if(s.inviter_id == author.id)
                    resp.setDescription("You already added this server and link is still active. "
                        + "\n[Press here to invite](" + link + ")");
                else
                    resp.setDescription("**" + s.inviter_name 
                        + "** already added this server to list, but invite is still pending. "
                        + "\n[Press here to invite](" + link + ")");
                callback(resp);
                return;
            }
        } else if(s && s.status == "active")  {
            resp.setColor(utils.colors.red);
            resp.setTitle("Can't add this server");
            resp.setDescription("Bot is already on this server. Click [here](" + link +") if you need to invite it again");
            callback(resp);
            return;
        } else if(s && s.status == "banned")  {
            resp.setColor(utils.colors.red);
            resp.setTitle("Can't add this server");
            resp.setDescription("This server is marked as banned");
            callback(resp);
            return;
        }

        let srv = {
            server_id: srvID,
            inviter_id: author.id,
            inviter_name: author.username,
            created: new Date(),
            status: "pending"
        };

        icollection.insert(srv).then(() => {
            resp.setColor(utils.colors.green);
            resp.setTitle("Successfully added!");
            resp.setDescription("This server was added to the list. Bot invite will be active for next **20 hours**\n"
                + "To get invite status use `->server status [server_id]`\n"
                + "If you don't have permission to add bots to this server, forward the invide link to server administrator\n"
                + "[Press to invite](" + link + ")\n");
            resp.addField("OR forward this invite link", "`" + link + "`", false);
            callback(resp);

        }).catch(() => {
            resp.setColor(utils.colors.red);
            resp.setTitle("Internal error");
            resp.setDescription("Can't add invite right now. Please try again later");
            callback(resp);
        });

    }).catch(e => {
        resp.setColor(utils.colors.red);
        resp.setTitle("Internal error");
        resp.setDescription(e);
        callback(resp);
    });
}

function getStatus(srvID, callback) {
    let resp = new Discord.RichEmbed();
    icollection.findOne({server_id: srvID}).then(s => {
        if(s) {
            let expHours = 20 - utils.getHoursDifference(s.created);
            if(s.status == "pending") {
                if(expHours > 0) {
                    resp.setColor(utils.colors.yellow);
                    resp.setTitle("Invite pending");
                    resp.setDescription("Server is in database and can be added within next **" + expHours + "** hours");
                } else {
                    resp.setColor(utils.colors.red);
                    resp.setTitle("Invite expired");
                    resp.setDescription("Invite to this server has expired. Create a new one");
                }
            } else if(s.status == "banned") {
                resp.setColor(utils.colors.red);
                resp.setTitle("Invite banned");
                resp.setDescription("This server is marked as banned. Bot can't be used on that server");
            } else {
                resp.setColor(utils.colors.green);
                resp.setTitle("Invite used");
                resp.setDescription("Everything set up! Bot is already on server");
            }
        } else {
            resp.setColor(utils.colors.green);
            resp.setTitle("Can't find server");
            resp.setDescription("Seems like bot was not invited to this server yet. Go ahead and invite it!");
        }
        callback(resp);
    }).catch(e => {
        resp.setColor(utils.colors.red);
        resp.setTitle("Internal error");
        resp.setDescription(e);
        callback(resp);
    });
}

function banServer(srvID, callback) {
    icollection.findOne({server_id: srvID}).then(s => {
        if(s) {
            icollection.update(
                {server_id: srvID},
                {$set: {status: "banned"}}
            );
            if(callback) callback("Server with id **" + srvID + "** was banned");
            return;
        } 

        if(callback) callback("Can't find server with id **" + srvID + "**");
    }).catch(e => logger.error(e));
}

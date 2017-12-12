module.exports = {
    processRequest, connect, getStatus, checkStatus, checkOnJoin
}

var mongodb, ucollection, icollection;
const Discord = require('discord.js');
const logger = require('./log.js');
const utils = require('./localutils.js');
const settings = require('../settings/general.json');
const changelog = require('../help/updates.json');
const dbManager = require("./dbmanager.js");
const link = "https://discordapp.com/oauth2/authorize?client_id=340988108222758934&scope=bot&permissions=125952";

const col = {
    red: "#DB1111",
    yellow: "#FFAF00",
    green: "#0FBA4D"
}

function connect(db) {
    mongodb = db;
    ucollection = db.collection('users');
    icollection = db.collection('invites');
}

function processRequest(message, args, callback) {
    var req = args.shift();
    switch(req) {
        case "status":
            getStatus(args[0], callback);
            break;
        case "list":
            //list(callback);
            break;
        case "ban":
            if(dbManager.isAdmin(message.author.id))
                banServer(args[0], callback);
            break;
        default:
            tryAdd(message.author, req, callback);
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

function getInviteLink() {
    client.generateInvite(['SEND_MESSAGES', 'MANAGE_GUILD', 'MENTION_EVERYONE'])
        .then(link => {
        
    });
}

function checkOnJoin(guild, botUser) {
    let def = dbManager.getDefaultChannel(guild, botUser);
    let resp = new Discord.RichEmbed();
    resp.setColor(col.red);

    if(guild.memberCount < 10) {
        resp.setTitle("Server is invalid");
        resp.setDescription("For technical reasons bot can't function on small servers.\n"
            + "Please, invite **Amusement Club** again when you have 10 or more members");
        def.send(resp).then(() => guild.leave());
        return;
    }

    setInvited(guild.id, t => {
        if(t == 'pending') {
            def.send(
                "**Amusement Club here!**\n"
                + "I am a card game bot that allows *you* to obtain some nice cards in your collection.\n"
                + "Get chance to win one of those below!\n"
                + "Type `->help` and get started",
                './invite.png')
            .then(() => {
                if(guild.channels.array().filter(c => c.name.includes('bot')).length == 0) {
                    resp.setColor(col.yellow);
                    resp.setTitle("Notice");
                    resp.setDescription("This server has no any **bot** channel.\n"
                        + "In order to **Amusement Club** function properly, you need to have special channel "
                        + "that has 'bot' in the name.\n`(e.g. 'bot-commands', 'bot', 'bot_stuff', etc)`");
                    def.send(resp);
                }
            });
        }
        else if(t == 'banned') {
            resp.setTitle("Bot can't function on this server");
            resp.setDescription("This bot was banned from this server. **Amusement Club** will leave after this message");
            def.send(resp).then(() => m.guild.leave());
        }
        else if(t == null) {
            resp.setTitle("Bot is not registered!");
            resp.setDescription("Server administrator has to run `->invite [server_id]` in bot DMs\n"
                + "Run `->help invite` for more information");
            def.send(resp);
        }
    });
}

function checkStatus(m, callback) {
    if(!m.guild) {
        callback(null);
        return;
    }

    icollection.findOne({server_id: m.guild.id}).then(s => {
        let resp = new Discord.RichEmbed();
        resp.setColor(col.red);
        resp.setTitle("Bot can't function on this server");

        if(!m.content.startsWith(settings.botprefix)
            || m.content.startsWith(settings.botprefix + 'invite')) {
            callback(null);
            return;
        }

        if(s) {
            if(s.status == "pending") {
                setInvited(m.guild.id);
                callback(null);
                return;
            } else if(s.status == "banned") {
                resp.setDescription("This bot was banned from this server. **Amusement Club** will leave after this message");
                m.guild.leave();
            } 
            else {callback(null); return;}
        }
        else resp.setDescription("This bot is not registered on this server.\n"
            + "Please, ask server administrator to run `->invite [server_id]` to add this server to bot's list");

        callback(resp);
    });
}

function tryAdd(author, srvID, callback) {
    let resp = new Discord.RichEmbed();
    if(!srvID) {
        resp.setColor(col.red);
        resp.setTitle("Usage");
        resp.setDescription("`->invite [server_id]`");
        callback(resp);
        return;
    }

    if(isNaN(srvID)) {
        resp.setColor(col.red);
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
            resp.setColor(col.yellow);
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
            resp.setColor(col.red);
            resp.setTitle("Can't add this server");
            resp.setDescription("Bot is already on this server");
            callback(resp);
            return;
        } else if(s && s.status == "banned")  {
            resp.setColor(col.red);
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
            resp.setColor(col.green);
            resp.setTitle("Successfully added!");
            resp.setDescription("This server was added to the list. Bot invite will be active for next **20 hours**\n"
                + "To get invite status use `->server status [server_id]`\n"
                + "If you don't have permission to add bots to this server, forward the invide link to server administrator\n"
                + "[Press to invite](" + link + ")\n");
            resp.addField("OR forward this invite link", "`" + link + "`", false);
            callback(resp);

        }).catch(() => {
            resp.setColor(col.red);
            resp.setTitle("Internal error");
            resp.setDescription("Can't add invite right now. Please try again later");
            callback(resp);
        });

    }).catch(e => {
        resp.setColor(col.red);
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
                    resp.setColor(col.yellow);
                    resp.setTitle("Invite pending");
                    resp.setDescription("Server is in database and can be added within next **" + expHours + "** hours");
                } else {
                    resp.setColor(col.red);
                    resp.setTitle("Invite expired");
                    resp.setDescription("Invite to this server has expired. Create a new one");
                }
            } else if(s.status == "banned") {
                resp.setColor(col.red);
                resp.setTitle("Invite banned");
                resp.setDescription("This server is marked as banned. Bot can't be used on that server");
            } else {
                resp.setColor(col.green);
                resp.setTitle("Invite used");
                resp.setDescription("Everything set up! Bot is already on server");
            }
        } else {
            resp.setColor(col.green);
            resp.setTitle("Can't find server");
            resp.setDescription("Seems like bot was not invited to this server yet. Go ahead and invite it!");
        }
        callback(resp);
    }).catch(e => {
        resp.setColor(col.red);
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

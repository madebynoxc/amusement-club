const Discord = require("discord.io");
const dbManager = require("./modules/dbmanager.js");
const utils = require("./modules/localutils.js");
const logger = require('./modules/log.js');
const settings = require('./settings/general.json');
const react = require('./modules/reactions.js');
const quickhelp = require('./help/quick.json');
const heroDB = require('./modules/heroes.js');
const forge = require('./modules/forge.js');
const stats = require('./modules/stats.js');
const inventory = require('./modules/inventory.js');
const changelog = require('./help/updates.json');
const helpMod = require('./modules/help.js');
const vote = require('./modules/vote.js');
const invite = require('./modules/invite.js');
const crystal = require('./modules/crystal.js');
const transactions = require('./modules/transactions.js');
var bot, curgame = 0;

var cooldownList = [];
var restartChannelID;

//https://discordapp.com/oauth2/authorize?client_id=340988108222758934&scope=bot&permissions=125952

bot = new Discord.Client({
    token: settings.token
});

dbManager.connect(bot);
_init();

function _init() {
    
    react.setBot(bot);

    bot.on("ready", (event) => {
        console.log('[Discord.IO] Logged in as %s - %s\n', bot.username, bot.id);
        bot.getAllUsers();
        bot.setPresence({game: {name: "->help"}});
        if(restartChannelID) {
            bot.sendMessage({to: restartChannelID, message: "Discord.io websocket connection was restarted. Connected to discord"});
            restartChannelID = null;
        }
    });

    bot.on("disconnect", (errMsg, code) => {
        if(errMsg || code) { 
            console.log("[Discord.IO ERROR#" + code + "] " + errMsg);
            setTimeout(() => bot.connect(), 1000);
        }
        console.log("[Discord.IO] Discord Bot Disconnected");
    });

    bot.on("guildCreate", g => {
        console.log("Registered guild: " + g.name);
        invite.checkOnJoin(g);
    });

    bot.on("message", (username, userID, channelID, message, event) => {
        var channel = bot.channels[channelID];
        var guild = channel? bot.servers[channel.guild_id] : null;
        var user = bot.users[userID];
        if(!user && guild) user = guild.members[userID];
        if(!user) return;
        user.username = username;

        if(user.bot && userID === bot.id)
            selfMessage(event.d);
        else if(!user.bot) {
            log(username, channel, guild, message);
            invite.checkStatus(message, guild, t => {
                if(!t){
                    if(cooldownList.includes(userID)) return;
                    cooldownList.push(userID);
                    setTimeout(() => removeFromCooldown(userID), 2000);

                    getCommand(user, channel, guild, message, event, (res, obj) => {
                        if(obj) bot.uploadFile({to: channelID, file: obj, message: res});
                        else if(res) {
                            if(typeof res === "string") bot.sendMessage({to: channelID, message: res});
                            else bot.sendMessage({to: channelID, embed: res});
                        } 
                    });
                }
                else bot.sendMessage({to: channelID, embed: t});
            });
        }
    });

    bot.on("any", (message) => {
        let _data = message.d;
        switch (message.t) {
            case "MESSAGE_REACTION_ADD":
                react.onCollectReaction(_data.user_id, _data.channel_id, _data.message_id, _data.emoji);
                break;
        }
    });

    bot.connect();
}

function removeFromCooldown(userID) {
    let i = cooldownList.indexOf(userID);
    cooldownList.splice(i, 1);
}

function _stop() {
    logger.message("Discord Bot Shutting down");
    return bot.disconnect();
}

function log(username, channel, guild, message) {
    var msg = '';
    try {
		msg = "[" + guild.id + "] #" + channel.name + " @" + username + ": " + message;
	} catch(e) {
		msg = "DM @" + username + ": " + message;
	}
    logger.message(msg);
}

function selfMessage(msg) {
    //try {
        let e = msg.embeds[0];
        if(!e || !e.footer) return;
        if(e.footer.text.includes('> Page')) {
            react.setupPagination(msg, e.title.split("**")[1]);
        }
    //} finally {};
}

function getCommand(user, channel, guild, message, event, callback) {
    var channelType = channel? 1 : 0; //0 - DM, 1 - channel, 2 - bot channel
    if(channelType == 1) {
        if(channel.name.includes('bot')) channelType = 2;
        // dbManager.addXP(user, message.length / 20, 
        //     (mes) => callback(mes));
    }

    if(message.startsWith(settings.botprefix)) {
        let cnt = message.toLowerCase().substring(2).split(' ');
        let sb = cnt.shift();
        cnt = cnt.filter(n => { return n != undefined && n != '' }); 

        if(sb[0] === '?') {
            if(channelType == 1) callback('Help can be called only in bot channel');
            else callback(getHelp(sb.substring(1)));
            return;
        }

        switch(sb) {
            case 'help': 
                helpMod.processRequest(user, channel, cnt, callback);
                return;
            case 'vote': 
                vote.processRequest(user, channel, cnt, callback);
                return;
            case 'cl': 
            case 'claim': 
                if(channelType == 0) callback('Claiming is available only on servers');
                else if(channelType == 1) callback('Claiming is possible only in bot channel');
                else {
                    dbManager.claim(user, guild.id, cnt, (text, img) => {
                        callback(text, img);
                    });
                }
                return;
            case 'dif':
            case 'diff':
            case 'difference':
                if(channelType == 0) callback('Available only on servers');
                else if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    let inp = utils.getUserID(cnt);
                    dbManager.difference(user, inp.id, inp.input, (text) => {
                        callback(text);
                    });
                }
                return;
            case 'sum': 
            case 'summon':
                dbManager.summon(user, cnt, callback);
                return;
            case 'eval':
                dbManager.eval(user, cnt, callback);
                return;
            case 'bal': 
            case 'balance': 
                if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    dbManager.getXP(user, (bal) =>{
                        callback(bal);
                    });
                }
                return;
            case 'give':
            case 'send':
                if(channelType == 0) callback('Card transfer is possible only on servers');
                else if(channelType == 1) callback('Card transfer is possible only in bot channel');
                else {
                    let inp = utils.getUserID(cnt);
                    dbManager.transfer(user, inp.id, inp.input, guild, (text) =>{
                        callback(text);
                    });
                }
                return;
            case 'block':
                if(channelType == 0) callback('This operation is possible in bot channel only');
                else if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    let inp = utils.getUserID(cnt);
                    dbManager.block(user, inp.id, inp.input, (text) =>{
                        callback(text);
                    });
                }
                return;
            case 'ratio':
                if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    dbManager.transfer(user, null, '-ratio', guild, (text) =>{
                        callback(text);
                    });
                }
                return;
            case 'pay':
                if(channelType == 0) callback('Tomato transfer is possible only on servers');
                else if(channelType == 1) callback('Tomato transfer is possible only in bot channel');
                else {
                    let inp = utils.getUserID(cnt);
                    dbManager.pay(user.id, inp.id, inp.input, guild, (text) =>{
                        callback(text);
                    });
                }
                return;
            case 'trans':
            case 'sent':
            case 'sends':
            case 'got':
            case 'gets':
            case 'transactions':
                if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    transactions.processRequest(user, sb, cnt, (text) => {
                        callback(text);
                    });
                }
                return;
            case 'list':
            case 'cards':
                if(channelType == 1) return callback('This operation is possible in bot channel only');
                else {
                  dbManager.getCards(user, cnt, (data, found) => {
                      if(!found) callback(data);
                      else callback(react.addNew(user, data));
                  });
                }
                return;
            case 'sell':
                if(channelType == 1) return callback('This operation is possible in bot channel only');
                else {
                    dbManager.sell(user, cnt, (text) => {
                        callback(text);
                    });
                }
                return;
            case 'daily':
                if(channelType == 0) callback('Daily claim is available only on servers');
                else if(channelType == 1) callback('Daily claim is available only in bot channel');
                else {
                    dbManager.daily(user, (text) => {
                        callback(text);
                    });
                }
                return;
            case 'baka': 
                var u = getUserID(cnt[0]);
                var time = Date.now() - new Date(event.d.timestamp);
                if(u) dbManager.getUserName(u, name => 
                    callback("**" + name + "** is now baka! ( ` ω ´ )"));
                else callback(user.username + ", **you** baka! (￣^￣ﾒ) in **" + time + "ms**");
                return;
            case 'quest':
            case 'quests':
                if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    dbManager.getQuests(user, (text) => {
                        callback(text);
                    });
                }
                return;
            case 'award': 
                if(dbManager.isAdmin(user.id)) {
                    let tusr = getUserID(cnt.shift());
                    let tom = parseInt(cnt);
                    if(tusr && tom){
                        dbManager.award(tusr, tom, (text) => {
                            callback(text);
                        });
                    } else {
                        callback("Wrong arguments");
                    }
                } else {
                    callback(user.username + ", 'award' is admin-only command");
                }
                return;
            case 'lead':
            case 'leaderboard':
            case 'leaderboards':
                if(channelType == 0) callback("You can't check leaderboards in DMs");
                else {
                    dbManager.leaderboard_new(cnt, guild, (text) =>{
                        callback(text);
                    });
                }
                break;
            case 'has':
                if(channelType == 0) callback("You can't ask that in DMs");
                else if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    let inp = utils.getUserID(cnt);
                    dbManager.doesUserHave(user, inp.id, inp.input, (text) =>{
                        callback(text);
                    });
                }
                break;
            case 'hero':
                if(channelType == 0) callback("Hero commands are possible on server only");
                else if(channelType == 1) callback('Hero commands available only in bot channel');
                else {
                    heroDB.processRequest(user.id, cnt, guild, (text, file) => {
                        callback(text, file);
                    });
                }
                return;
            case 'craft':
            case 'forge':
                if(channelType == 0) callback("You forge cards in DM");
                else if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    forge.processRequest(user.id, cnt, (text, file) => {
                        callback(text, file);
                    });
                }
                return;
            case 'inv':
            case 'inventory':
                if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    inventory.processRequest(user.id, cnt, (text, file) => {
                        callback(text, file);
                    });
                }
                return;
            case 'miss':
                if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    dbManager.needsCards(user, cnt, (text) => {
                        callback(text);
                    });
                }
                return;
            case 'fav':
                if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    dbManager.fav(user, cnt, (text) => {
                        callback(text);
                    });
                }
                return;
            case 'whohas':
                if(dbManager.isAdmin(user.id)) {
                    dbManager.whohas(user, guild, cnt, (text) => {
                        callback(text);
                    });
                }
                return;
            case 'track':
                if(dbManager.isAdmin(user.id)) {
                    let tusr = getUserID(cnt.shift());
                    dbManager.track(user, tusr, channel, (text) => {
                        callback(text);
                    });
                }
                return;
            case 'stat':
            case 'stats':
            case 'statistics':
                if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    stats.processRequest(cnt, (text, file) => {
                        callback(text, file);
                    });
                }
                return;
            case 'invite':
                if(channelType !== 0) {
                    bot.createDMChannel(user.id, (err, res) => {
                        bot.sendMessage({to: res.id, message: "You should use this command here in Direct Messages to bot"});
                    });
                }
                else invite.processRequest(user, message, cnt, callback);
                return;
            case 'res':
                if(channelType == 1) callback('This command is available only in bot channel');
                else crystal.getRecipe(user, cnt, callback);
                return;
            case 'kill': 
                if(dbManager.isAdmin(user.id)) {
                    callback("Shutting down now");
                    setTimeout(() => { _stop(); }, 2000); 
                }
                return;
            case 'restart': 
                if(dbManager.isAdmin(user.id)) {
                    restartChannelID = channel.id;
                    callback("Restarting websocket connection in 2 seconds...");
                    _stop();
                    setTimeout(() => bot.connect(), 2000);
                }
                return;
            case 'version':
            case 'updates':
            case 'whatsnew':
                if(channelType == 1) callback('This command is available only in bot channel');
                else {
                    let mes = "";
                    if(cnt.includes("all")) {
                        for(let i=0; i < Math.min(7, changelog.length); i++)
                            mes += getUpdateLog(i) + "\n\n";
                    } else mes = getUpdateLog(0);
                    callback(mes);
                }
                return;
        } 
    } else if(channelType == 2) {
        helpMod.processUserInput(message.toLowerCase(), user, callback);
    }
}

function getUpdateLog(index) {
    let mes = "**" + changelog[index].version + "**\n";
    mes += changelog[index].changes.join("\n");
    return mes;
}

function getHelp(com) {
    var phrases = quickhelp.filter(e => e.name == com);
    if(phrases.length > 0) {
        return phrases[0].values.join('\n');
    }
    return undefined;
}

function getUserID(inp) {
    try{
        if (/^\d+$/.test(inp)) {
            // Filters out most names that start with a number while only
            // filtering out the first month of snowflakes
            // Since Discord wasn't launched until March of the year,
            // you'd have to have a user made before its release to be filtered
            // 1000 ms/s * 60 s/m * 60 m/h * 24 h/d * 30 d/M * 2 ** 22 snowflake date offset
            if (inp > (1000 * 60 * 60 * 24 * 30 * 2 ** 22)) {
                return inp
            }
        }
        return inp.slice(0, -1).split('@')[1].replace('!', '');
    } catch(e) {
        return null;
    }
}

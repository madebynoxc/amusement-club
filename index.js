const Discord = require("discord.io");
const dbManager = require("./modules/dbmanager.js");
const utils = require("./modules/localutils.js");
const logger = require('./modules/log.js');
const settings = require('./settings/general.json');
const react = require('./modules/reactions.js');
const heroDB = require('./modules/heroes.js');
const forge = require('./modules/forge.js');
const stats = require('./modules/stats.js');
const inventory = require('./modules/inventory.js');
const changelog = require('./help/updates.json');
const helpMod = require('./modules/help.js');
const vote = require('./modules/vote.js');
const invite = require('./modules/invite.js');
const transactions = require('./modules/transactions.js');
const sellManager = require('./modules/sell.js');
const cardList = require('./modules/list.js');
const auctions = require('./modules/auctions.js');
const collections = require('./modules/collections.js');
const admin = require('./modules/admin.js');
const guilds = require('./modules/guild.js');
const antifraud = require('./modules/antifraud.js');
const boosts = require('./modules/boosts.js');

var bot, curShard = 0, shards = 0;
var cooldownList = [];
var restartChannelID;

curShard = parseInt(process.argv[2]) || 0;
shards = parseInt(process.argv[3]) || 1;

bot = new Discord.Client({
    token: settings.token,
    shard: [curShard, shards]
});

console.log("Started bot instance " + curShard + "/" + shards);

dbManager.connect(bot, curShard, shards);
_init();

function _init() {
    
    react.setBot(bot);

    bot.on("ready", (event) => {
        console.log(`[${curShard}] Found ${Object.keys(bot.servers).length} guilds`)
        console.log(`[${curShard}] Logged in as ${bot.username} ${bot.id}\n`);
        bot.getAllUsers();
        bot.setPresence({game: {name: "->help"}});
        if(restartChannelID) {
            bot.sendMessage({to: restartChannelID, message: "Discord.io websocket connection was restarted. Connected to discord"});
            restartChannelID = null;
        }
    });

    bot.on("disconnect", (errMsg, code) => {
        if(errMsg || code && code != 1000) { 
            console.log("[Discord.IO ERROR#" + code + "] " + errMsg);
            setTimeout(() => bot.connect(), 1000);
        } else {
            process.exit();
        }
        console.log("[Discord.IO] Discord Bot Disconnected");
    });

    bot.on("guildCreate", g => {
        //console.log("Registered guild: " + g.name);
        guilds.check(g);
    });

    bot.on("message", (username, userID, channelID, message, event) => {
        let channel = bot.channels[channelID];
        let guild = channel? bot.servers[channel.guild_id] : null;
        let user = bot.users[userID];
        if(!user && guild) user = guild.members[userID];
        if(!user) return;
        user.username = username;

        if(user.bot || cooldownList.includes(userID)) return;
        cooldownList.push(userID);
        let tm = setTimeout(() => removeFromCooldown(userID), 10000);

        getCommand(user, channel, guild, message, event, (res, obj) => {
            if(!channelID)
                bot.createDMChannel(userID, (err2, newChannel) => {
                    reply(newChannel.id, res, obj);          
                });
            else reply(channelID, res, obj);
            cooldownList = cooldownList.filter(x => x != userID)
            clearTimeout(tm)
        });
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

function reply(toID, res, obj) {
    if(obj) 
        bot.uploadFile({to: toID, file: obj, message: res});

    else if(res) {
        if(typeof res === "string") { 
            bot.sendMessage({to: toID, message: res}, (err, resp) => {
                if(err) console.log(err);
            });
        } else { 
            bot.sendMessage({to: toID, embed: res}, (err, resp) => {
                if(err) console.log(err);
            });
        }
    } 
}

function removeFromCooldown(userID) {
    cooldownList = cooldownList.filter(x => x != userID)
}

function _stop() {
    logger.message("Discord Bot Shutting down");
    return bot.disconnect();
}

function log(username, channel, guild, message) {
    let msg = '';
    try {
		msg = "[" + guild.id + "] #" + channel.name + " @" + username + ": " + message;
	} catch(e) {
		msg = "DM @" + username + ": " + message;
	}
    
    console.log(msg);
}

async function getCommand(user, channel, guild, message, event, callback) {
    let curg = guild? await guilds.getByID(guild.id) : {prefix: settings.botprefix};
    let channelType = channel? 1 : 0; //0 - DM, 1 - channel, 2 - bot channel
    if(channelType == 1 && curg.botChannels.includes(channel.id)) 
        channelType = 2; 
            
    if(message.startsWith(curg.prefix)) {
        log(user.username, channel, guild, message);
        let chanID = channel? channel.id : user.id;
        let cnt = message.toLowerCase().substring(curg.prefix.length).split(' ');
        let sb = cnt.shift();
        cnt = cnt.filter(n => { return n != undefined && n != '' }); 

        switch(sb) {
            case 'help': 
                helpMod.processRequest(user, channel, cnt, curg.prefix, callback);
                return;
            case 'vote': 
                vote.processRequest(user, cnt, callback);
                return;
            case 'admin':
                if(dbManager.isAdmin(user.id))
                    await admin.processRequest(user, channel, cnt, callback);
                return;
            case 'cl': 
            case 'claim': 
                if(channelType == 0) callback('Claiming is available only on servers');
                else if(channelType == 1) botOnly(chanID);
                else {
                    bot.sendMessage({to: chanID, 
                        message: 'Loading your cards...'}, async function(err, resp) {
                            if(resp) { 
                                await dbManager.claim(user, curg, chanID, cnt, (text, img) => {
                                    bot.deleteMessage({channelID: chanID, messageID: resp.id}); 
                                    callback(text, img);
                                });
                            }
                        });
                }
                return;
            case 'server': 
            case 'guild': 
                if(channelType == 0) callback('This operation is possible only on server');
                else 
                    guilds.processRequest(user, guild, chanID, cnt, callback);
                return;
            case 'dif':
            case 'diff':
            case 'difference':
                if(channelType == 0) callback('Available only on servers');
                else if(channelType == 1) botOnly(chanID);
                else {
                    let inp = utils.getUserID(cnt);
                    dbManager.difference(user, inp, (data, found) => {
                        if(!found) callback(data);
                        else {
                            react.addNewPagination(user.id, 
                                user.username + ", your card difference with " + found + " (" + data.length + " results):", 
                                cardList.getPages(data), chanID);
                        }
                    });
                }
                return;
            case 'sum': 
            case 'summon':
                dbManager.summon(user, cnt, callback);
                return;
            case 'info': 
            case 'cardinfo':
                dbManager.getCardInfo(user, cnt, callback);
                return;
            case 'eval':
                dbManager.eval(user, cnt, callback);
                return;
            case 'rate':
                let rating = Number(cnt.shift());
                dbManager.rate(user, rating, cnt, callback);
                return;
            case 'bal': 
            case 'balance': 
                if(channelType == 1) botOnly(chanID);
                else {
                    dbManager.getXP(user, (bal) =>{
                        callback(bal);
                    });
                }
                return;
            case 'auc':
            case 'auctions':
                if(channelType == 1) botOnly(chanID);
                else {
                    auctions.processRequest(user, cnt, chanID, callback);
                }
                return;
            case 'block':
                if(channelType == 0) botOnly(chanID);
                else if(channelType == 1) botOnly(chanID);
                else {
                    let inp = utils.getUserID(cnt);
                    dbManager.block(user, inp.id, inp.input, (text) =>{
                        callback(text);
                    });
                }
                return;
            case 'trans':
            case 'confirm':
            case 'sends':
            case 'decline':
            case 'gets':
            case 'pending':
            case 'transactions':
                if(channelType == 1) botOnly(chanID);
                else {
                    transactions.processRequest(user, chanID, sb, cnt, (text) => {
                        callback(text);
                    });
                }
                return;
            case 'favs':
                cnt.unshift("-fav");
            case 'li':
            case 'ls':
            case 'list':
            case 'cards':
                if(channelType == 1) return botOnly(chanID);
                else {
                  dbManager.getCards(user, cnt, (data, found) => {
                        if(!found) callback(data);
                        else {
                            react.addNewPagination(user.id, 
                                user.username + ", your cards (" + data.length + " results):", 
                                cardList.getPages(data), chanID);
                        }
                  });
                }
                return;
            case 'sell':
                if(channelType == 1) return botOnly(chanID);
                else {
                    sellManager.processRequest(user, cnt, guild, chanID, (text) => {
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
                var u = utils.getUserID(cnt).id;
                var time = Date.now() - new Date(event.d.timestamp);
                if(u) dbManager.getUserName(u, name => 
                    callback("**" + name + "** is now baka! ( ` ω ´ )"));
                else callback(user.username + ", **you** baka! (￣^￣ﾒ) in **" + time + "ms**");
                return;
            case 'pat': 
                var u = utils.getUserID(cnt).id;
                if(u) dbManager.getUserName(u, name => 
                    callback("**" + user.username + "** pats **" + name + "** (；^＿^)ッ☆(　゜o゜)"));
                return;
            case 'quest':
            case 'quests':
                if(channelType == 1) botOnly(chanID);
                else {
                    dbManager.getQuests(user, (text) => {
                        callback(text);
                    });
                }
                return;
            case 'award': 
                if(dbManager.isAdmin(user.id)) {
                    let tusr = utils.getUserID(cnt).id;
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
            case 'top':
            case 'lead':
            case 'leaderboard':
            case 'leaderboards':
                if(channelType == 0) callback("You can't check leaderboards in DMs");
                else {
                    if ( cnt[0] && cnt[0].toLowerCase() == 'clout')
                        dbManager.topClout(cnt, guild, callback);
                    else
                        dbManager.leaderboard(cnt, guild, callback);
                }
                return;
            case 'has':
                if(channelType == 0) callback("You can't ask that in DMs");
                else if(channelType == 1) botOnly(chanID);
                else {
                    let inp = utils.getUserID(cnt);
                    dbManager.doesUserHave(user, inp.id, inp.input, (text) =>{
                        callback(text);
                    });
                }
                return;
            case 'hero':
                if(channelType == 1) callback('Hero commands available only in bot channel');
                else {
                    heroDB.processRequest(user.id, cnt, guild, chanID, (text, file) => {
                        callback(text, file);
                    });
                }
                return;
            case 'craft':
            case 'forge':
                if(channelType == 1 || channelType == 0) callback("This operation is possible in bot channel only");
                else {
                    forge.processRequest(user.id, cnt, (text, file) => {
                        callback(text, file);
                    });
                }
                return;
            case 'inv':
            case 'inventory':
                if(channelType == 1) botOnly(chanID);
                else {
                    inventory.processRequest(user.id, cnt, chanID, (text, file) => {
                        callback(text, file);
                    });
                }
                return;
            case 'miss':
                if(channelType == 1) botOnly(chanID);
                else {
                    dbManager.needsCards(user, cnt, (data, found) => {
                        if(!found) callback(data);
                        else {
                            react.addNewPagination(user.id, 
                                "You are missing these cards (" + data.length + " results):", 
                                cardList.getPages(data), chanID);
                        }
                    });
                }
                return;
            case 'unfav':
                cnt.unshift("remove");
            case 'fav':
                if(channelType == 1) botOnly(chanID);
                else {
                    cnt.unshift(chanID);
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
                if(channelType == 1) botOnly(chanID);
                else {
                    stats.processRequest(cnt, (text, file) => {
                        callback(text, file);
                    });
                }
                return;
            case 'col':
            case 'collection':
            case 'collections':
                collections.processRequest(user.id, cnt, chanID, (text, file) => {
                    callback(text, file);
                });
                return;
            case 'invite':
                invite.getLink(user, callback);
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
                if(channelType == 1) botOnly(chanID);
                else {
                    let mes = "";
                    if(cnt.includes("all")) {
                        for(let i=0; i < Math.min(7, changelog.length); i++)
                            mes += getUpdateLog(i) + "\n\n";
                    } else mes = getUpdateLog(0);
                    callback(mes);
                }
                return;
            case 'antifraud':
            case 'whotosmite':
            case 'fraud':
                if(channelType == 1) botOnly(chanID);
                else {
                    antifraud.processRequest(user, cnt, chanID, callback);
                }
                return;
            case 'boost':
            case 'boosts':
                if(channelType == 1) botOnly(chanID);
                else {
                    if(!dbManager.isAdmin(user.id))
                        cnt = ["list"];
                    boosts.processRequest(user, cnt, chanID, callback);
                }
                return;
        } 
    } else if(channelType == 2) {
        helpMod.processUserInput(message.toLowerCase(), user, callback);
    }
}

function botOnly(channelID) {
    bot.sendMessage({to: channelID, message: 'This command is possible only in bot channel'}, (err, resp) => {
        setTimeout(() => {
            if(resp)
                bot.deleteMessage({channelID: channelID, messageID: resp.id}); 
        }, 3000);
    });
}

function getUpdateLog(index) {
    let mes = "**" + changelog[index].version + "**\n";
    mes += changelog[index].changes.join("\n");
    return mes;
}

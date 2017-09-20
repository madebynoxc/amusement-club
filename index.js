const Discord = require("discord.js");
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
var bot, curgame = 0;

//https://discordapp.com/oauth2/authorize?client_id=340988108222758934&scope=bot&permissions=125952

dbManager.connect();
_init();

function _init() {
    bot = new Discord.Client();

    bot.on("ready", () => {
        console.log("Discord Bot Connected");
        console.log("Discord Bot Ready");
        //setInterval(gameLoop, 5000);
        bot.user.setGame("->help | ->?cards", "https://www.twitch.tv/");
    });

    bot.on("disconnected", () => {
        console.log("Discord Bot Disconnected");
    });

    bot.on("message", (message) => {
        if(message.author.bot) {
            if(message.author.id === bot.user.id) {
                selfMessage(message);
            }
        } else {
            log(message);
            getCommand(message, (res, obj) => {
                if(!res && !obj) 
                    return false;
                    
                message.channel.send(res, obj);
            });
        }
    });

    console.log("Trying to log in ");
    bot.login(settings.token).catch((reason) => {
        console.log(reason);
    });
}

function _stop() {
    logger.message("Discord Bot Shutting down");
    return bot.destroy();
}

function log(message) {
    var msg = '';
    try {
		msg = message.guild.name + " : " + message.channel.name + " : " + message.author.username + " : " + message.content;
	} catch(e) {
		msg = "PW : " + message.author.username + " : " + message.content;
	}
    logger.message(msg);
}

function gameLoop() {
    bot.user.setGame(settings.games[curgame], "https://www.twitch.tv/");
    curgame++;
    if(curgame >= settings.games.length)
        curgame = 0;
}

function selfMessage(m) {
    if(m.content.includes('\u{1F4C4}')) {
        react.setupPagination(m, m.content.split("**")[1]);
    }
}

function getCommand(m, callback) {
    var channelType = m.channel.name? 1 : 0; //0 - DM, 1 - channel, 2 - bot channel
    if(channelType == 1) {
        if(m.channel.name.includes('bot')) channelType = 2;
        dbManager.addXP(m.author, m.content.length / 15, 
            (mes) => callback(mes));
    }

    if(m.content.startsWith(settings.botprefix)) {
        let cnt = m.content.toLowerCase().substring(2).split(' ');
        let sb = cnt.shift();
        cnt = cnt.filter(function(n){ return n != undefined && n != '' }); 
        let cd = cnt.join(' ');

        if(sb[0] === '?') {
            if(channelType == 1) callback('Help can be called only in bot channel');
            else callback(getHelp(sb.substring(1)));
            return;
        }

        switch(sb) {
            case 'help': 
                //callback(showHelp(m));
                helpMod.processRequest(m, cnt, callback);
                return;
            case 'cl': 
            case 'claim': 
                if(channelType == 0) callback('Claiming is available only on servers');
                else if(channelType == 1) callback('Claiming is possible only in bot channel');
                else {
                    dbManager.claim(m.author, m.guild.id, cnt, (text, img) => {
                        callback(text, {file: img });
                    });
                }
                return;
            case 'dif':
            case 'diff':
            case 'difference':
                dbManager.difference(m.author, getUserID(cnt.shift()), cnt, (text) => {
                    callback(text);
                });
                return;
            case 'sum': 
            case 'summon':
                if(cd.length < 3) 
                    callback("Please, specify card name");
                else {
                    dbManager.summon(m.author, cd, (text, img) => {
                        callback(text, {file: img });
                    });
                }
                return;
            case 'bal': 
            case 'balance': 
                dbManager.getXP(m.author, (bal) =>{
                    callback(bal);
                });
                return;
            case 'give':
            case 'send':
                if(channelType == 0) callback('Card transfer is possible only on servers');
                else if(channelType == 1) callback('Card transfer is possible only in bot channel');
                else {
                    let usr = getUserID(cnt.shift());
                    let cdname = cnt.join(' ').trim();
                    if(usr){
                        dbManager.transfer(m.author, usr, cdname, (text) =>{
                            callback(text);
                        });
                    }
                }
                return;
            case 'pay':
                if(channelType == 0) callback('Tomato transfer is possible only on servers');
                else if(channelType == 1) callback('Tomato transfer is possible only in bot channel');
                else {
                    let tusr = getUserID(cnt.shift());
                    let tom = parseInt(cnt);
                    if(tusr && tom){
                        dbManager.pay(m.author.id, tusr, tom, (text) =>{
                            callback(text);
                        });
                    }
                }
                return;
            case 'list':
            case 'cards':
                if(channelType == 1) callback('Card listing is possible only in bot channel');
                else {
                  dbManager.getCards(m.author.id, (data) => {
                      if(!data) callback("**" + m.author.username + "** has no any cards");
                      else callback(react.addNew(m.author, cnt, data));
                  });
                }
                return;
            case 'sell':
                dbManager.sell(m.author, cd, (text) =>{
                    callback(text);
                });
                return;
            case 'daily':
                if(channelType == 0) callback('Daily claim is available only on servers');
                else if(channelType == 1) callback('Daily claim is available only in bot channel');
                else {
                    dbManager.daily(m.author.id, (text) => {
                        callback(text);
                    });
                }
                return;
            case 'baka': 
                var u = getUserID(cnt[0]);
                if(u) dbManager.getUserName(u, name => 
                    callback("**" + name + "** is now baka! ( ` ω ´ )"));
                else callback(m.author.username + ", **you** baka! (￣^￣ﾒ)");
                return;
            case 'quest':
            case 'quests':
                dbManager.getQuests(m.author, (text) =>{
                    callback(text);
                });
                return;
            case 'award': 
                if(isAdmin(m.author.id)) {
                    let tusr = getUserID(cnt.shift());
                    let tom = parseInt(cnt);
                    if(tusr && tom){
                        dbManager.award(tusr, tom, (text) =>{
                            callback(text);
                        });
                    } else {
                        callback("Wrong arguments");
                    }
                } else {
                    callback(m.author.username + ", 'award' is admin-only command");
                }
                return;
            case 'lead':
            case 'leaderboard':
            case 'leaderboards':
                if(channelType == 0) callback("You can't check leaderboards in DMs");
                else {
                    dbManager.leaderboard_new(cnt, m.guild, (text) =>{
                        callback(text);
                    });
                }
                break;
            case 'has':
                if(channelType == 0) callback("You can't ask that in DMs");
                else {
                    let usr = getUserID(cnt.shift());
                    let cdname = cnt.join(' ').trim();
                    if(usr){
                        dbManager.doesUserHave(m.author.username, usr, cdname, (text) =>{
                            callback(text);
                        });
                    }
                }
                break;
            case 'hero':
                if(channelType == 1) callback('Hero commands available only in bot channel');
                else {
                    heroDB.processRequest(m.author.id, cnt, (text, file) => {
                        callback(text, file);
                    });
                }
                return;
            case 'craft':
            case 'forge':
                if(channelType == 0) callback("You forge cards in DM");
                else if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    forge.processRequest(m.author.id, cnt, (text, file) => {
                        callback(text, file);
                    });
                }
                return;
            case 'inv':
            case 'inventory':
                if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    inventory.processRequest(m.author.id, cnt, (text, file) => {
                        callback(text, file);
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
            case 'fix':
                if(isAdmin(m.author.id)) {
                    dbManager.fixUserCards();
                }
                return;
            case 'kill': 
                if(isAdmin(m.author.id)) {
                    callback("Shutting down now");
                    setTimeout(() => { _stop(); }, 2000); 
                }
                return;
            case 'whatsnew':
                if(channelType == 1) callback('This command is available only in bot channel');
                else {
                    let mes = "";
                    if(cd == "all") {
                        for(let i=0; i<Math.min(7, changelog.length); i++)
                            mes += getUpdateLog(i) + "\n\n";
                    } else mes = getUpdateLog(0);
                    callback(mes);
                }
                return;
        }
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

function isAdmin(sender) {
    return settings.admins.includes(sender);
}

function getUserID(inp) {
    try{
        return inp.slice(0, -1).split('@')[1].replace('!', '');
    } catch(e) {
        return null;
    }
}

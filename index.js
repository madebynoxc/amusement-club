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
const invite = require('./modules/invite.js');
var bot, curgame = 0;

var cooldownList = [];

//https://discordapp.com/oauth2/authorize?client_id=340988108222758934&scope=bot&permissions=125952

dbManager.connect();
_init();

function _init() {
    bot = new Discord.Client();

    bot.on("ready", () => {
        console.log("Discord Bot Connected");
        console.log("Discord Bot Ready");
        bot.user.setGame("->help | ->?cards", "https://www.twitch.tv/");
    });

    bot.on("disconnected", () => {
        console.log("Discord Bot Disconnected");
    });

    bot.on("guildCreate", g => {
        invite.checkOnJoin(g, bot.user);
    });

    bot.on("message", (message) => {
        if(message.author.bot) {
            if(message.author.id === bot.user.id)
                selfMessage(message);

        } else {
            log(message);
            invite.checkStatus(message, t => {
                if(!t){
                    if(cooldownList.includes(message.author.id)) return;
                    cooldownList.push(message.author.id);
                    setTimeout(() => removeFromCooldown(message.author.id), 2000);

                    getCommand(message, (res, obj) => {
                        if(!res && !obj) return;
                        message.channel.send(res, obj? {file: obj} : null);
                    });
                }
                else message.channel.send("", t);
            });
        }
    });

    console.log("Trying to log in ");
    bot.login(settings.token).catch((reason) => {
        console.log(reason);
    });
}

function removeFromCooldown(userID) {
    let i = cooldownList.indexOf(userID);
    cooldownList.splice(i, 1);
}

function _stop() {
    logger.message("Discord Bot Shutting down");
    return bot.destroy();
}

function log(m) {
    var msg = '';
    try {
		msg = "[" + m.guild.name + "'" + .guild.id + "'] #" + m.channel.name + " @" + m.author.username + ": " + m.content;
	} catch(e) {
		msg = "DM @" + m.author.username + ": " + m.content;
	}
    logger.message(msg);
}

function selfMessage(m) {
    try {
        let e = m.embeds[0];
        if(!e || !e.footer) return;
        if(e.footer.text.includes('> Page')) {
            react.setupPagination(m, e.title.split("**")[1]);
        }
    } finally {};
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
                    dbManager.difference(m.author, inp.id, inp.input, (text) => {
                        callback(text);
                    });
                }
                return;
            case 'sum': 
            case 'summon':
                dbManager.summon(m.author, cnt, callback);
                return;
            case 'eval':
                dbManager.eval(m.author, cnt, callback);
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
                    let inp = utils.getUserID(cnt);
                    dbManager.transfer(m.author, inp.id, inp.input, (text) =>{
                        callback(text);
                    });
                }
                return;
            case 'ratio':
                if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    dbManager.transfer(m.author, null, '-ratio', (text) =>{
                        callback(text);
                    });
                }
                return;
            case 'pay':
                if(channelType == 0) callback('Tomato transfer is possible only on servers');
                else if(channelType == 1) callback('Tomato transfer is possible only in bot channel');
                else {
                    let inp = utils.getUserID(cnt);
                    dbManager.pay(m.author.id, inp.id, inp.input, (text) =>{
                        callback(text);
                    });
                }
                return;
            case 'list':
            case 'cards':
                if(channelType == 1) callback('Card listing is possible only in bot channel');
                else {
                  dbManager.getCards(m.author, cnt, (data, found) => {
                      if(!found) callback(data);
                      else callback(react.addNew(m.author, data));
                  });
                }
                return;
            case 'sell':
                dbManager.sell(m.author, cnt, (text) =>{
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
                if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    dbManager.getQuests(m.author, (text) =>{
                        callback(text);
                    });
                }
                return;
            case 'award': 
                if(dbManager.isAdmin(m.author.id)) {
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
                    let inp = utils.getUserID(cnt);
                    dbManager.doesUserHave(m.author, inp.id, inp.input, (text) =>{
                        callback(text);
                    });
                }
                break;
            case 'hero':
                if(channelType == 0) callback("Hero commands are possible on server only");
                else if(channelType == 1) callback('Hero commands available only in bot channel');
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
            case 'miss':
                if(channelType == 1) callback('This operation is possible in bot channel only');
                else {
                    dbManager.needsCards(m.author, cnt, (text) => {
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
                if(channelType !== 0) m.author.send("You should use this command here in Direct Messages to bot");
                else invite.processRequest(m, cnt, callback);
                return;
            case 'kill': 
                if(dbManager.isAdmin(m.author.id)) {
                    callback("Shutting down now");
                    setTimeout(() => { _stop(); }, 2000); 
                }
                return;
            case 'version':
            case 'updates':
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
    } else if(channelType == 2) {
        helpMod.processUserInput(m.content.toLowerCase(), m.author, callback);
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

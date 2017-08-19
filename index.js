const Discord = require("discord.js");
const dbManager = require("./modules/dbmanager.js");
const utils = require("./modules/localutils.js");
const logger = require('./modules/log.js');
const settings = require('./settings/general.json');
var bot;

//https://discordapp.com/oauth2/authorize?client_id=340988108222758934&scope=bot&permissions=125952

dbManager.connect();
_init();

function _init() {
    bot = new Discord.Client();

    bot.on("ready", () => {
        console.log("Discord Bot Connected");
        bot.user.setGame("->help");
        console.log("Discord Bot Ready");
    });

    bot.on("disconnected", () => {
        console.log("Discord Bot Disconnected");
    });

    bot.on("message", (message) => {
        if(message.author.bot) 
            return false;

        log(message);
        getCommand(message, (res, obj) => {
            if(!res && !obj) 
                return false;
                
            message.channel.send(res, obj);
        });
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

function getCommand(m, callback) {
    var channelType = m.channel.name? 1 : 0; //0 - DM, 1 - channel, 2 - bot channel
    if(channelType == 1) {
        if(m.channel.name.includes('bot')) channelType = 2;
        console.log(channelType);
        dbManager.addXP(m.author, m.content.length / 12, 
            (mes) => callback(mes));
    }

    if(m.content.startsWith('=>')) {
        let cnt = m.content.toLowerCase().substring(2).split(' ');
        let sb = cnt.shift();
        let cd = cnt.join(' ').trim();

        switch(sb) {
            case 'help': 
                callback(showHelp(m));
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
            /*case 'dif':
            case 'difference':
                dbManager.difference(m.author.id, getUserID(cnt.shift()), (text) => {
                    callback(text);
                });
                return;*/
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
                    let firstArg = cnt.shift();
                    let targetUsr = getUserID(firstArg);
                    let author = targetUsr? targetUsr : m.author.id;
                    let typeArg = targetUsr? parseInt(cnt.shift()) : parseInt(firstArg);
                    dbManager.getCards(author, typeArg? typeArg : 0, (text) =>{
                        callback(text);
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
                    dbManager.daily(m.author.id, (text) =>{
                        callback(text);
                    });
                }
                return;
            case 'baka': 
                callback(m.author.username + ", **you** baka! (￣^￣ﾒ)");
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
        }
    } 

    callback(undefined);
}

function getArguments() {

}

function isAdmin(sender) {
    return settings.admins.includes(sender);
}

function showHelp(message) {
    let e = new Discord.RichEmbed();
    e.setColor(settings.botcolor);
    e.setAuthor("\u2B50 Amusement Club \u2B50 Card Game \n")
    e.addField("->claim", "Claim a new card (costs an increasing ammount of \u{1F345} Tomatoes)", false);
    e.addField("->sum [name]", "Summons a card with name (in case you have it)", false);
    e.addField("->bal", "Shows your current \u{1F345} Tomato balance", false);
    e.addField("->give [user] [card]", "Transfers card to user", false);
    e.addField("->cards [user (optional)]", "Shows your cards, or some other [user]", false);
    e.addField("->pay [user] [amount]", "Sends \u{1F345} Tomatoes to [user]", false);
    e.addField("->daily", "Claims daily amount of \u{1F345} Tomatoes", false);
    e.addField("->sell [card]", "Sells a card. \u2B50=80\u{1F345} | \u2B50\u2B50=150\u{1F345} | \u2B50\u2B50\u2B50=300\u{1F345}", false);
    e.addField("->lead [?global]", "Shows top 5 users by overall card star amount", false);
    e.addField("Bot source code", "https://github.com/NoxCaos/amusement-club/", false);
    message.author.send("", { embed: e });
    return message.author.username + ", I've sent you a DM";
}
function getUserID(inp) {
    try{
        return inp.slice(0, -1).split('@')[1].replace('!', '');
    } catch(e) {
        return null;
    }
}

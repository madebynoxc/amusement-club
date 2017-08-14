const Discord = require("discord.js");
const dbManager = require("./modules/dbmanager.js");
const utils = require("./modules/localutils.js");
const logger = require('./modules/log.js');
const settings = require('./settings/general.json');
const helpBody = require('./help/general.json');
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
    if(m.channel.name)
        dbManager.addXP(m.author, m.content.length / 12, 
            (mes) => callback(mes));

    if(m.content.startsWith('->')) {
        let cnt = m.content.toLowerCase().substring(2).split(' ');
        let sb = cnt.shift();
        let cd = cnt.join(' ').trim();

        switch(sb) {
            case 'help': 
                callback(showHelp(m));
                return;
            case 'cl': 
            case 'claim': 
                dbManager.claim(m.author, m.guild.id, cnt, (text, img) => {
                    callback(text, {file: img });
                });
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
                let usr = getUserID(cnt.shift());
                let cdname = cnt.join(' ').trim();
                if(usr){
                    dbManager.transfer(m.author, usr, cdname, (text) =>{
                        callback(text);
                    });
                }
                return;
            case 'pay':
                let tusr = getUserID(cnt.shift());
                let tom = parseInt(cnt);
                if(tusr && tom){
                    dbManager.pay(m.author.id, tusr, tom, (text) =>{
                        callback(text);
                    });
                }
                return;
            case 'list':
            case 'cards':
                let firstArg = cnt.shift();
                let targetUsr = getUserID(firstArg);
                let author = targetUsr? targetUsr : m.author.id;
                let typeArg = targetUsr? parseInt(cnt.shift()) : parseInt(firstArg);
                dbManager.getCards(author, typeArg? typeArg : 0, (text) =>{
                    callback(text);
                });
                return;
            case 'sell':
                dbManager.sell(m.author, cd, (text) =>{
                    callback(text);
                });
                return;
            case 'daily':
                dbManager.daily(m.author.id, (text) =>{
                    callback(text);
                });
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
                dbManager.leaderboard_new(cnt, m.guild, (text) =>{
                    callback(text);
                });
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
    e.setAuthor(helpBody.title)
    helpBody.fields.forEach(function(element) {
       e.addField(element.title, element.description, false); 
    }, this);

    message.author.send("", { embed: e });

    if(message.channel.name) return "**" + message.author.username + "**, I've sent you a DM";
    return undefined;
}
function getUserID(inp) {
    try{
        return inp.slice(0, -1).split('@')[1].replace('!', '');
    } catch(e) {
        return null;
    }
}

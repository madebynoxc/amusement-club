const forever = require('forever-monitor');
const settings = require('./settings/ayano.json');
const acsettings = require('./settings/general.json');
const Discord = require("discord.io");
const djs = require("discord.js");
const cardmanager = require('./modules/cardmanager.js');
const dbmanager = require('./modules/dbmanager.js');
var MongoClient = require('mongodb').MongoClient;

var restarts = 0;
var mongodb, stdout, isrestart = false;

var bot = new Discord.Client({
    token: settings.token,
    autorun: true
});

bot.on("ready", (event) => {
    console.log('[Ayano.bot] Logged in as %s - %s\n', bot.username, bot.id);

    var child = new (forever.Monitor)(settings.startpoint, {
        max: 5,
        silent: false,
        killTree: true,
        minUptime: 2000
    });

    child.on('exit', function () {
        if(restarts > 4) {
            bot.sendMessage({
                to: settings.reportchannel, 
                embed: formError("RESTART LIMIT REACH", "Forever reached restart limit and now will shut down bot. Sorry")
            });
            console.log('[Ayano] Bot has exited after 5 restarts');
        }
        restarts = 0;
    });

    child.on('error', function (err) {
        restarts++;
        bot.sendMessage({
            to: settings.reportchannel, 
            embed: formError("AC Process exited with code 1!", err)
        });
        console.log('[Ayano ERROR] ' + err);
    });

    child.on('stderr', function (data) {
        bot.sendMessage({
            to: settings.reportchannel, 
            embed: formError("AC Unhalded promise rejection", err)
        });
        console.log('[Ayano ERROR] ' + err);
    });

    child.on('stop', function (data) {
        if(isrestart) return;
        bot.sendMessage({
            to: settings.reportchannel, 
            embed: formConfirm("Process stopped", "Amusement Club was manually stopped")
        });
        console.log('[Ayano] Bot stopped');
    });

    child.on('start', function (data) {
        bot.sendMessage({
            to: settings.reportchannel, 
            embed: formConfirm("Process started successfully", "Amusement Club is up and running!")
        });
        console.log('[Ayano] Bot started');
    });

    child.on('restart', function (data) {
        bot.sendMessage({
            to: settings.reportchannel, 
            embed: formConfirm("Restarted", "Amusement Club was restarted and now online again!")
        });
        console.log('[Ayano] Bot restarted');
        isrestart = false;
    });

    MongoClient.connect(acsettings.database, function(err, db) {
        if(err) return console.log("[Ayano ERROR] DB connect error: " + err);
        console.log('[Ayano] Connected to DB'); 
        mongodb = db;
    });

    //child.start();
    //console.log(child);

    bot.on("message", (username, userID, channelID, message, event) => {
        if(!message.startsWith("ayy")) return;
        if(message === "ayy") {
            bot.sendMessage({
                to: channelID, 
                message: "lmao"
            });
            return;
        }

        if(userID == settings.adminID) {
            console.log(message.substring(4));
            switch(message.substring(4)) {
                case 'help':
                    showCommands(); break;
                case 'update': 
                    console.log('[Ayano] Trying to update cards...'); 
                    updateCards(); break;
                case 'start': 
                    console.log('[Ayano] Starting Amusement Club process...'); 
                    child.start(); break;
                case 'stop': 
                    console.log('[Ayano] Stopping Amusement Club process...'); 
                    child.stop(); break;
                case 'restart': 
                    console.log('[Ayano] Restarting Amusement Club process...'); 
                    restarts = 0; 
                    isrestart = true;
                    child.restart(); break;
                default:
                    other(message.substring(4));    
            }
        }
    });
});

function formError(title, desc) {
    let e = new djs.RichEmbed();
    e.setColor('#DB1111');
    e.setTitle(title);
    e.setDescription(desc);
    e.setFooter("Ayano: Amusement Club monitoring | Restartcount: " + restarts);
    return e;
}

function formConfirm(title, desc) {
    let e = new djs.RichEmbed();
    e.setColor('#0FBA4D');
    e.setTitle(title);
    e.setDescription(desc);
    e.setFooter("Ayano: Amusement Club monitoring");
    return e;
}

function showCommands(argument) {
    bot.sendMessage({
        to: settings.reportchannel, 
        embed: formConfirm("Command list", "update [cards]\nstart [bot]\nstop [bot]\nrestart [bot]")
    });
}

function updateCards() {
    if(!mongodb){
        bot.sendMessage({
            to: settings.reportchannel, 
            embed: formError("Can't update cards", "The connection to database is invalid")
        });
        return;
    } 

    cardmanager.updateCards(mongodb, cards => {
        let e = new djs.RichEmbed();
        e.setColor('#0FBA4D');
        e.setTitle("Finished updating cards");
        if(cards.length == 0) e.setDescription("No cards were added");
        else {
            var emb = "";
            cards.map(c => {
                emb += "**" + c.name.replace('=', '') + "** collection got **" + c.count + "** new cards\n";
            });
            e.setDescription(emb);
        }

        bot.sendMessage({
            to: settings.reportchannel, 
            embed: e
        });
    });
}

function askDB(args) {
    var split = args.split('(');
    var col = split[0].substring(3);
    var query = split[1].substring(0, 1);
}

function other(args) {
    console.log("[Ayano] Executing: " + args);

    if(args.startsWith('db.')) {
        return askDB(args);
    }
    args = args.split(' ');

    try {
        stdout = "";
        let child = forever.start(args, {
            max : 0,
            silent : false,
        });

        child.on('stdout', function (data) {
            stdout += data + "\n";
        });

        child.on('exit', function (code) {
            bot.sendMessage({
                to: settings.reportchannel, 
                embed: formConfirm(args, stdout)
            });
        });
    } catch(e) {
        bot.sendMessage({
            to: settings.reportchannel, 
            embed: formError("Can't spawn process " + args, e)
        });
    }
}

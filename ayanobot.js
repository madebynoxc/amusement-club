const fs = require('fs');
const forever = require('forever-monitor');
const settings = require('./settings/ayano.json');
const acsettings = require('./settings/general.json');
const Discord = require("discord.io");
const cardmanager = require('./modules/cardmanager.js');
const utils = require("./modules/localutils.js");
const collections = require('./modules/collections.js');
const heroes = require('./modules/heroes.js');
const MongoClient = require('mongodb').MongoClient;

var mongodb, stdout;
var ayymembers, ayystats, ucollection, instances = [];

var bot = new Discord.Client({
    token: settings.token
});

MongoClient.connect(acsettings.database, function(err, db) {
    if(err) return console.log("[Ayano ERROR] DB connect error: " + err);
    console.log('[Ayano] Connected to DB'); 
    mongodb = db;
    collections.connect(db);
    ucollection = db.collection("users");
    ayymembers = db.collection("ayanousers");
    ayystats = db.collection("ayanostats");
    bot.connect();
});

bot.on("ready", (event) => {
    console.log('[Ayano.bot] Logged in as %s - %s\n', bot.username, bot.id);

    bot.setPresence({ 
        game: { 
            type: 3, 
            name: "over Amusement Club"
        } 
    });
});

bot.on("disconnect", (errMsg, code) => {
    if(errMsg || code) { 
        console.log("[Ayano ERROR#" + code + "] " + errMsg);
        setTimeout(() => bot.connect(), 1000);
    }
    console.log("[Ayano] Discord Bot Disconnected");
});

bot.on("message", async (username, userID, channelID, message, event) => {
    message = message.toLowerCase();
    if(message === "ayy")
        return sendMessage(channelID, "lmao");

    if(userID != acsettings.clientid && message.includes("tomato")) 
        bot.addReaction({ channelID: channelID, messageID: event.d.id, reaction: "🍅" });

    if(!message.startsWith("ayy")) return;

    if(channelID == settings.botcommchannel) {
        let splitMessage = message.split(' ');
        let num = parseInt(splitMessage[2]);
        switch(splitMessage[1]) {
            case 'help':
                showCommands(); break;
            case 'update': 
                console.log('[Ayano] Trying to update cards...'); 
                updateCardsRemote(); break;
            case 'start': 
                console.log('[Ayano] Starting Amusement Club process...'); 
                if(instances.length > 0)
                    num = instances.length;

                startBot(!num? settings.shards : num); break;
            case 'rename': 
                rename(message.substring(11)); break;
            case 'stop': 
                if(isNaN(num)) {
                    console.log('[Ayano] Stopping ALL Amusement Club instances...'); 
                    instances.forEach(inst => {if(inst.running) inst.stop()});
                } else {
                    console.log('[Ayano] Stopping Amusement Club instance #' + num); 
                    instances[num].stop();  
                } break;
            case 'getsources':
                scanImageSources();
                break;
            case 'restart':
                if(instances.length > 0) {
                    if(isNaN(num)) {
                        console.log('[Ayano] Restarting ALL Amusement Club instances...'); 
                        instances.forEach(inst => inst.restart());
                    } else {
                        console.log('[Ayano] Restarting Amusement Club instance #' + num); 
                        instances[num].restart();
                    }
                } else
                    bot.sendMessage({
                        to: settings.botcommchannel, 
                        embed: formError("Can't restart any process", "Seems like there are no processes initialized.\n"
                            + "Try running `ayy start` first")
                    });
                break;
            case 'status':
                getStatus();
                break;
            default:
                if(userID == settings.adminID)
                    other(message.substring(4));
        }

    } else if(channelID) {
        let check = await publicCommands(username, channelID, message, event);
        if(check) return;
        
        let ayyDBUser = await ayymembers.findOne({discord_id: userID});
        if(ayyDBUser.isMod || userID == settings.adminID) {
            let id = message.split(' ')[2];
            let comm = message.split(' ')[1];
            
            switch(comm) {
                case 'addmod':
                    if(id && userID == settings.adminID){
                        ayymembers.update({discord_id: id}, {$set: {isMod: true}});
                        sendEmbed(channelID, formConfirm(null, "User was set as Ayano moderator"));
                    } else 
                        sendEmbed(channelID, formError("Can't execute", "You have no rights to execute this command or arguments are incorrert"));
                    break;
                case 'rmmod':
                    if(id && userID == settings.adminID){
                        ayymembers.update({discord_id: id}, {$set: {isMod: false}});
                        sendEmbed(channelID, formConfirm(null, "Moderator perms were removed"));
                    } else 
                        sendEmbed(channelID, formError("Can't execute", "You have no rights to execute this command or arguments are incorrert"));
                    break;
                case 'find':
                case 'count':
                    doRequest(message.substring(4), channelID);
                    break;
            }
        }
    }
});

bot.on("any", (message) => {
    let _data = message.d;
    switch (message.t) {
        case "MESSAGE_REACTION_ADD":
            if(_data.emoji.name == "🔁"){
                let u = bot.users[_data.user_id];
                quote(u.username, _data.channel_id, _data.channel_id, _data.message_id);
            }
            break;
    }
});

bot.on("guildMemberAdd", async member =>  {
    console.log("New member " + member.id);
    let user = bot.users[member.id];

    let ayyDBUser = await ayymembers.findOne({discord_id: member.id});
    let acDBUser = await ucollection.findOne({discord_id: member.id});
    let msg = "";

    if(ayyDBUser) {
        msg += `Welcome back, <@${user.id}>\nDid you forget something?`;
        if(ayyDBUser.joinCount > 2) 
            sendMessage(settings.reportchannel, `User **${user.username} (${user.id})** joined server **${ayyDBUser.joinCount}** times :thinking:`);
        ayymembers.update({discord_id: member.id}, {$inc: {joinCount: 1}});
    } else {
        msg += `Ayy welcome, <@${user.id}>`;
        if(!acDBUser) {
            msg += "\nPlease read <#475932375499538435>";
            msg += "\nAlso here is your :doughnut:\nJoin **Amusement Club** gacha! Get started with `->claim` in <#351871635424542731> !";
        } else {
            if(acDBUser.hero) msg += ` and **${acDBUser.hero.name}** (level ${heroes.getHeroLevel(acDBUser.hero.exp)})!`;
            msg += "\nPlease read <#475932375499538435>";
            msg += "\nYou can ask bot related questions in <#370742439679492096>\nTrade your cards in <#351957621437235200>";
        }
        addNewUser(user);
    }

    sendMessage(settings.mainchannel, msg);
});

bot.on("guildCreate", g => {
    let usercount = 0;
    Object.keys(g.members).forEach((mID, member) => {
        let user = bot.users[mID];
        ayymembers.findOne({discord_id: user.id}).then(ayyDBUser => {
            if(!ayyDBUser) addNewUser(user);
        });

        usercount++;
    });

    console.log("[Ayano] Found " + usercount + " users");
});

function getStatus() {
    let msg = "";
    let cnt = 0;
    msg += `Database: **${mongodb.serverConfig.isConnected()? "`✅`" : "`❌`"}**\n`;
    instances.forEach(inst => {
        msg += `Instance [${cnt}]: **${inst.running? "`✅`" : "`❌`"}**\n`;
        cnt++;
    });

    bot.sendMessage({
        to: settings.botcommchannel, 
        embed: formConfirm("Current status", msg)
    });
}

function startBot(shards) {
    bot.sendMessage({
        to: settings.botcommchannel, 
        embed: formWarn("Starting bot", `Starting ${shards} Amusement Club instances`)
    });

    for(let i=0; i<shards; i++) {

        if(instances[i]) {
            if(!instances[i].running)
                instances[i].start();

            continue;
        }

        let child = new (forever.Monitor)(settings.startpoint, {
            max: 100,
            silent: false,
            killTree: true,
            minUptime: 2000,
            spinSleepTime: 10000,
            args: [i, shards]
        });

        child.on('exit', function () {
            bot.sendMessage({
                to: settings.botcommchannel, 
                embed: formError(null, `Bot process #${i} stopped`)
            });
        });

        child.on('error', function (err) {
            bot.sendMessage({
                to: settings.botcommchannel, 
                embed: formError(`Error occured in #${i}`, err.toString())
            });
        });

        child.on('stderr', function (err) {
            bot.sendMessage({
                to: settings.botcommchannel, 
                embed: formError(`Error occured in #${i}`, err.toString())
            });
        });

        child.on('stop', function (data) {
            console.log(`Stopped process #${i}`);
        });

        child.on('start', function (data) {
            //console.log('[Ayano] Bot started');
        });

        child.on('restart', function (data) {
            bot.sendMessage({
                to: settings.botcommchannel, 
                embed: formWarn(null, `Restarting bot process #${i}`)
            });
            console.log('[Ayano] Bot restarted');
        });

        child.on('stdout', function (data) {
            if(data.includes("Logged in as"))
                bot.sendMessage({
                    to: settings.botcommchannel, 
                    embed: formConfirm(null, "Started bot process #" + i)
                });
        });

        instances.push(child);
        child.start();
    }
}

async function publicCommands(username, channelID, message, event) {
    let comm = message.split(' ')[1];
    let id = message.split(' ')[2];
    let guild = bot.servers[event.d.guild_id];

    switch(comm) {
        case 'quote':
        case 'repost':
        if(id) {
            let newChID = message.split(' ')[3];
            if(newChID && newChID.startsWith('<#'))
                newChID = newChID.substring(2, newChID.length - 1);

            quote(username, newChID? newChID : channelID, channelID, id, event.d.id);
            return true;
        }
    }

    return false;
}

async function quote(username, targChannelID, channelID, id, requestID) {
    bot.getMessage( {channelID: targChannelID, messageID: id.trim()}, (err, msg) => {
        if(err) {
            if(err.statusCode == 404)
                sendEmbed(channelID, formError(null, "Can't find message with that ID"));
            return false;
        }

        let emb = {};
        emb.color = 3570568;
        emb.description = msg.content;
        emb.author = {
            name: msg.author.username + " 🔁 " + username,
            icon_url: "https://cdn.discordapp.com/avatars/" 
                + msg.author.id + "/"
                + msg.author.avatar + ".png"
        };

        emb.footer = {
            text: (new Date(msg.timestamp)).toLocaleString()
        }

        if(msg.attachments.length > 0) {
            emb.image = {url: msg.attachments[0].url}

        } else if(msg.embeds.length > 0) {
            emb.image = msg.embeds[0].image;
            emb.description = msg.embeds[0].description;
        }

        sendEmbed(channelID, emb);

        if(requestID)
            bot.deleteMessage({channelID: channelID, messageID: requestID}); 
    }); 
}

function addNewUser(user) {
    ayymembers.insert({
        discord_id: user.id,
        username: user.username,
        joinCount: 1,
        isMod: false
    });
}

function formError(title, desc) {
    let e = utils.formatError(null, title, desc);
    e.footer = { text: "Ayano: Amusement Club monitoring" };
    return e;
}

function formConfirm(title, desc) {
    let e = utils.formatConfirm(null, title, desc);
    e.footer = { text: "Ayano: Amusement Club monitoring" };
    return e;
}

function formWarn(title, desc) {
    let e = utils.formatWarning(null, title, desc);
    e.footer = { text: "Ayano: Amusement Club monitoring" };
    return e;
}

function doRequest(argstr, channelID) {
    try {
        let args = argstr.split(' ');
        let type = args.shift();
        let col = mongodb.collection(args.shift());
        let query = JSON.parse(args.join(' '));

        switch(type) {
            case 'find':
                col.findOne(query).then(res => {
                    if(res){
                        let resmsg = "";
                        Object.keys(res).forEach((key, val) => { 
                            if(Array.isArray(res[key]))
                                resmsg += key + ": **[" + res[key].length + "]**\n";
                            else
                                resmsg += key + ": **" + res[key] + "**\n";
                        });
                        sendEmbed(channelID, formConfirm("Returned results", resmsg));
                    } else
                        sendEmbed(channelID, formError(null, "Nothing found"));
                });
                break;
            case 'count':
                col.count(query).then(amount => {
                    sendEmbed(channelID, formConfirm(null, "Found **" + amount + "**"));
                });
                break;
        }
    } catch(e) { sendEmbed(channelID, formError(null, e.toString())) }
}

function sendMessage(where, message) {
    bot.sendMessage({
        to: where, 
        message: message
    });
}

function sendEmbed(where, emb) {
    bot.sendMessage({
        to: where, 
        embed: emb
    });
}

function showCommands(argument) {
    bot.sendMessage({
        to: settings.botcommchannel, 
        embed: formConfirm("Command list", "update [cards]\nstart [bot]\nstop [bot]\nrestart [bot]\nrename [card query], [new name]")
    });
}

function rename(argument) {
    if(!mongodb){
        bot.sendMessage({
            to: settings.botcommchannel, 
            embed: formError("Can't update card", "The connection to database is invalid")
        });
        return;
    } 

    argument = argument.split(',');
    if(argument.length < 2) 
        return bot.sendMessage({
            to: settings.botcommchannel, 
            embed: formError("Can't update card", "Make sure you have getter and setter split by `,`")
        });

    let getstr = argument[0].toLowerCase().split(' ');
    let setstr = argument[1].toLowerCase();
    let result = "";
    let query = utils.getRequestFromFiltersNoPrefix(getstr);

    if(!query.collection || !query.collection.$in[0])
        return bot.sendMessage({
            to: settings.botcommchannel, 
            embed: formError("Can't update card", "Please include collection name")
        });

    let col = collections.parseCollection(query.collection.$in[0])[0];
    let qCol = col.special? mongodb.collection('promocards') : mongodb.collection('cards');

    qCol.findOne(query).then(card => {
        if(!card)
            return bot.sendMessage({
                to: settings.botcommchannel, 
                embed: formError("Can't update card", "Card was not found")
            });

        let newname = setstr.trim().replace(/ /gi, '_');
        query = utils.getCardQuery(card);

        qCol.update(query, {$set: {name: newname}}).then(res => {
            result += "Card **" + utils.getFullCard(card) + "** is updated in database\n";
            mongodb.collection('users').updateMany(
                {cards: {"$elemMatch": query}}, 
                {$set: {"cards.$.name": newname}}).then(res => {

                result += "Found **" + res.matchedCount + "** users with this card\n";
                result += "Modified **" + res.modifiedCount + "** user cards\n";

                result += "Card update finished\n";
                return bot.sendMessage({
                    to: settings.botcommchannel, 
                    embed: formConfirm("Update finished", result)
                });
            });
        });
    });
}

function updateCards() {
    if(!mongodb){
        bot.sendMessage({
            to: settings.botcommchannel, 
            embed: formError("Can't update cards", "The connection to database is invalid")
        });
        return;
    } 

    cardmanager.updateCards(mongodb, cards => {
        var emb = "";

        if(cards.length == 0) emb = "No cards were added";
        else {
            
            cards.map(c => {
                emb += "**" + c.name.replace('=', '') + "** collection got **" + c.count + "** new cards\n";
            });
        }

        bot.sendMessage({
            to: settings.botcommchannel, 
            embed: utils.formatConfirm(null, "Finished updating cards", emb)
        });
    });
}

async function updateCardsRemote() {
    if(!mongodb){
        bot.sendMessage({
            to: settings.botcommchannel, 
            embed: formError("Can't update cards", "The connection to database is invalid")
        });
        return;
    } 

    bot.sendMessage({
        to: settings.botcommchannel, 
        embed: formWarn(null, null, "Updating cards, please wait...")
    });

    let res = await cardmanager.updateCardsS3(mongodb);
    var emb = "";

    if(res.collected.length == 0) emb = "No cards were added";
    else {
        res.collected.map(o => {
            emb += "**" + o.name + "** collection got **" + o.count + "** new cards\n";
        });
    }

    if(res.warnings.length > 0) {
        bot.sendMessage({
            to: settings.botcommchannel, 
            embed: utils.formatWarn(null, "Warning!", res.warnings.join('\n'))
        });
    }

    bot.sendMessage({
        to: settings.botcommchannel, 
        embed: utils.formatConfirm(null, "Finished updating cards", emb)
    }, (err, resp) => {
        if(err) {
            bot.sendMessage({
                to: settings.botcommchannel, 
                embed: utils.formatWarn(null, null, "Finished updating cards, but failed to list updated collections")
            });
        }
    });
}

function other(args) {
    console.log("[Ayano] Executing: " + args);

    if(!args.startsWith('git')) return;

    try {
        stdout = "";
        let child = forever.start(args.substring(4), {
            max : 0,
            silent : false,
            command : 'git'
        });

        child.on('stdout', function (data) {
            stdout += data + "\n";
        });

        child.on('exit', function (code) {
            bot.sendMessage({
                to: settings.botcommchannel, 
                embed: formConfirm(args, stdout)
            });
        });
    } catch(e) {
        bot.sendMessage({
            to: settings.botcommchannel, 
            embed: formError("Can't spawn process " + args, e)
        });
    }
}

function setPic(index, callback) {
    bot.editServer( {"serverID":"351871492536926210", "icon":images[index]}, callback);
}

const dir = "../sources/";
function scanImageSources() {
    let files = fs.readdirSync(dir);
    let count = 0;

    files.forEach(file => {
        console.log("-----------------Processing " + file);
        let cnt = fs.readFileSync(dir + file, 'utf8');
        
        cnt.split('\n').forEach(str => {
            let name = str.split(' - ')[0];
            let link = str.split(' - ')[1];
            let level = name? parseInt(name[0]) : 0;
            let nameonly = name.toLowerCase().trim().substring(2);
            if(name && link && level) {
                mongodb.collection("cards").update({
                    name: nameonly,
                    level: level
                }, {
                    $set: { source: link.trim() }
                });
                count++;
                console.log(level + " - " + nameonly);
            }
        });
    });

    bot.sendMessage({
        to: settings.botcommchannel, 
        embed: utils.formatConfirm(null, "Finished scanning image sources", "Assigned for **" + count + "** images")
    });
}

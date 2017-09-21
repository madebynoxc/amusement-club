module.exports = {
    processRequest, connect
}

var mongodb, ucollection, icollection;
const logger = require('./log.js');
const utils = require('./localutils.js');
const changelog = require('../help/updates.json');
const link = "https://discordapp.com/oauth2/authorize?client_id=340988108222758934&scope=bot&permissions=125952";

function connect(db) {
    mongodb = db;
    ucollection = db.collection('users');
    icollection = db.collection('invites');
}

function processRequest(message, args, callback) {
    var req = args.shift();
    switch(req) {
        case "add":
            tryAdd(messae.autor, args[0], callback);
            break;
        case "status":
            getStatus(args[0], callback);
            break;
        case "list":
            list(callback);
            break;
        case "ban":
            banServer(args[0], callback);
            break;
    }
}

function tryAdd(author, srvID, callback) {
    let resp = new Discord.RichEmbed();
    icollection.findOne({server_id: srvID}).then(s => {
        if(s && !s.status == "pending") {
            let expHours = 20 - utils.getHoursDifference(s.created);
            //resp.color = "#E2266A";
            resp.setColor("#FFAF00");
            resp.setTitle("Can't add this server");

            if(expHours > 0) {
                if(s.inviter_id == author.id)
                    resp.setDescription("You already added this server and link is still active. \n[Press here to invite](" + link + ")");
                else
                    resp.setDescription("**" + s.inviter_name 
                        + "** already added this server to list, but invite is still pending. \n[Press here to invite](" + link + ")");
                callback("", resp);
                return;
            }
        } else if(s && s.status == "active")  {
            resp.setColor("#E2266A");
            resp.setTitle("Can't add this server");
            resp.setDescription("Bot is already on this server");
            callback("", resp);
            return;
        } else if(s && s.status == "banned")  {
            resp.setColor("#E2266A");
            resp.setTitle("Can't add this server");
            resp.setDescription("This server is marked as banned");
            callback("", resp);
            return;
        }

        let srv = {
            server_id: srvID,
            inviter_id: author.id,
            inviter_name: author.username,
            created: new Date(),
            status: "pending"
        };
        icollection.insert(srv);

        resp.setColor("#0FBA4D");
        resp.setTitle("Successfully added!");
        resp.setDescription("This server was added to the list. Bot invite will be active for next **20 hours**\n"
            + "To get invite status use `->server status [server_id]`\n"
            + "If you don't have permission to add bots to this server, forward the invide link to server administrator\n"
            + "[Press to invite](" + link + ")\n");
        resp.addField("Forward this invite link", "`" + link + "`", false);
        callback("", resp);

    }).catch(e => {
        resp.setColor("#E2266A");
        resp.setTitle("Internal error");
        resp.setDescription(e);
        callback("", resp);
    });
}

function getStatus(srvID, callback) {

}

function list(callback) {

}
module.exports = {
    processRequest, connect
}

const utils = require('./localutils.js');

var mongodb, bot;

function connect(db, client) {
    mongodb = db;
    bot = client;
}

function processRequest(user, channel, args, callback) {
    bot.createDMChannel(user.id, (err, res) => {
        if(err && channel)
            callback("**" + user.username + "**, can't send you a message. Please, allow direct messages from server members in privacy settings");

        if(!args || args == "") {
            if(channel) callback("**" + user.username + "**, details were sent to you"); 
            bot.sendMessage({to: res.id, embed: utils.formatConfirm(user, "Vote for new cards!", "please use our [special page](http://nonrg1.com/contest.html) to create your vote command. Once you have your vote command, please paste it here and reply directly to this message to cast your vote! If you have any questions feel free to message in #support of [Bot Discord](https://discord.gg/kqgAvdX)\nPage address in case hyperlink is not working: `http://nonrg1.com/contest.html`")});
        } else {
            if(channel) return callback("**" + user.username + "**, please cast your vote in direct messages"); 

            castVote(user, args, m => {
               bot.sendMessage({to: res.id, embed: m}); 
            });
        }
    });
}

function castVote(user, args, callback) {
    mongodb.collection("users").findOne({discord_id: user.id}).then(dbUser => {
        if(!dbUser) return;

        if(!dbUser.hero) return callback(utils.formatError(user, null, "you need a hero in order to vote"));

        mongodb.collection("votes").findOne({user_id: user.id}).then(resp => {
            if(resp) return callback(utils.formatError(user, "Already voted", "you already voted in this contest"));

            try {
                let nums = [];
                if(args.length > 10) throw "WrongAmountException";

                args.map(e => {
                    let num = parseInt(e);
                    if(!num) throw "NaNException";
                    if(num < 101 || num > 166) throw "WrongNumberException";
                    if(nums.includes(num)) throw "DuplicateException";
                    nums.push(num);
                });

                mongodb.collection("votes").insert({
                    user_id: user.id,
                    username: user.username,
                    votes: nums
                }).then(() => callback(utils.formatConfirm(user, "Thank you", "your vote has been submitted successfully")))
                .catch(err => console.log(err));
            } catch(e) {
                return callback(utils.formatError(user, "Command error", "please, make sure you are using command genereted by [special tool](http://nonrg1.com/contest.html)\n" + e));
            }
        });
    });
}
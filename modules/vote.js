module.exports = {
    processRequest, connect
}

const utils = require('./localutils.js');

var mongodb, bot;

function connect(db, client) {
    mongodb = db;
    bot = client;
}

function processRequest(user, args, callback) {
    mongodb.collection("users").findOne({discord_id: user.id}).then(dbUser => {
        if(!dbUser) return;
        
        if(!dbUser.hero) 
            return callback(utils.formatError(user, null, "you need a hero in order to vote"));

        if(dbUser.dailystats && dbUser.dailystats.voted) 
            return callback(utils.formatError(user, null, "you already voted today. You can vote again after `->daily`"));

        const req = utils.getRequestFromFiltersNoPrefix(args);
        mongodb.collection("cards").findOne(req).then(card => {
            if(!card)
                return callback(utils.formatError(user, null, "card wasn't found"));

            const vote = { 
                user: dbUser.discord_id, 
                timestamp: new Date(),
                card: {
                    name: card.name, 
                    collection: card.collection, 
                    level: card.level
                }
            }

            if(!dbUser.dailystats) 
                dbUser.dailystats = {summon:0, send: 0, claim: 0, get: 0, quests: 0};

            dbUser.dailystats.voted = true;
            mongodb.collection("users").update({discord_id: user.id}, {$set: {dailystats: dbUser.dailystats}})
            mongodb.collection("votes").insert(vote)
                .then(() => callback(utils.formatConfirm(user, "Thank you", 
                    `your vote for **${utils.toTitleCase(card.name.replace(/_/gi, ' '))} \`${card.collection}\`** has been submitted successfully`)));
        });
    });
}

/*function castVote(user, args, callback) {
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
}*/

module.exports = {
    checkClaim, connect, getRandomQuests, 
    checkXP, checkSend, checkSummon
}

var mongodb, col;
const _ = require("lodash");
const questList = require('./quests.json');
const levenshtein = require('js-levenshtein');

function getRandomQuests() {
    let res = _.sampleSize(questList, 2);
    return res;
}

function connect(db) {
    mongodb = db;
    col = mongodb.collection('users');
}

function getQuest(user, key) {
    if(user.quests){
        for(let i=0; i<user.quests.length; i++) {
            if(user.quests[i].name.includes(key)){
                return user.quests[i];
            }
        }
    }
}

function checkClaim(user, callback) {
    let q = getQuest(user, 'claim');
    if(!q || !user.dailystats) return;

    if((q.name == 'claim5' && user.dailystats.claim >= 5) || 
    (q.name == 'claim10' && user.dailystats.claim >= 10)) {
        callback(completeMsg(user, q));
        removeQuest(user, q);
    }
}

function checkSend(user, sentlvl, callback) {
    let q = getQuest(user, 'send');
    if(!q) return;

    if((q.name == 'send2' && sentlvl == 2) || 
    (q.name == 'send3' && sentlvl == 3)) {
        callback(completeMsg(user, q));
        removeQuest(user, q);
    }
}

function checkSummon(user, callback) {
    let q = getQuest(user, 'sum');
    if(!q || !user.dailystats) return;

    if(q.name == 'sum5' && user.dailystats.summon >= 5) {
        callback(completeMsg(user, q));
        removeQuest(user, q);
    }
}

function checkXP(user, callback) {
    let q = getQuest(user, 'gain');
    if(!q) return;

    if((q.name == 'gain1000' && user.exp >= 1000) || 
    (q.name == 'gain2000' && user.exp >= 2000)) {
        callback(completeMsg(user, q));
        removeQuest(user, q);
    }
}

function removeQuest(user, quest) {
    col.update(
        { discord_id: user.discord_id },
        {
            $inc: {exp: quest.award},
            $pull: {quests: {name: quest.name} },
        }
    );
}

function completeMsg(user, q){
    return "**" + user.username + "**, you completed '" 
    + q.description + "'. " 
    + "**" + q.award + "** Tomatoes were added to your account!";
}
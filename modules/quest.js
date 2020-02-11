module.exports = {
    checkClaim, connect, getRandomQuests, completeNext,
    checkXP, checkSend, checkSummon, addBonusQuest, checkForge, preCheckSend, checkAuction
}

var mongodb, col;
const _ = require("lodash");
const questList = require('./quests.json');
const heroes = require('./heroes.js');
const utils = require('./localutils.js');
const promotions = require('../settings/promotions.json');

function getRandomQuests() {
    let res = _.sampleSize(questList, 2);
    while(res[0].name.substr(0, 3) == res[1].name.substr(0, 3)) {
        res[1] = _.sample(questList);
    }
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

    if((q.name == 'claim4' && user.dailystats.claim >= 4) || 
    (q.name == 'claim5' && user.dailystats.claim >= 5) ||
    (q.name == 'claim6' && user.dailystats.claim >= 6)) {
        callback(completeMsg(user, q));
        removeQuest(user, q, callback);
    }
}

function checkSend(user, sentlvl, callback) {
    let q = getQuest(user, 'send');
    if(!q) return;

    if((q.name == 'send2' && sentlvl == 2) || 
    (q.name == 'send3' && sentlvl == 3)) {
        callback(completeMsg(user, q));
        removeQuest(user, q, callback);
    }
}

function preCheckSend(user, sentlvl) {
    let q = getQuest(user, 'send');
    if(!q) return;

    if((q.name == 'send2' && sentlvl == 2) || 
    (q.name == 'send3' && sentlvl == 3)) {
        return true;
    }
    return false;
}

function checkSummon(user, callback) {
    let q = getQuest(user, 'sum');
    if(!q || !user.dailystats) return;

    if(q.name == 'sum2' && user.dailystats.summon >= 2) {
        callback(completeMsg(user, q));
        removeQuest(user, q, callback);
    }
}

function checkXP(user, callback) {
    let q = getQuest(user, 'gain');
    if(!q) return;

    if((q.name == 'gain500' && user.exp >= 500) || 
        (q.name == 'gain1000' && user.exp >= 1000) || 
        (q.name == 'gain1500' && user.exp >= 1500)) {
        callback(completeMsg(user, q));
        removeQuest(user, q, callback);
    }
}

function checkForge(user, lvl, callback) {
    let q = getQuest(user, 'forge');
    if(!q) return;

    if((q.name == 'forge2' && lvl == 2) || 
        (q.name == 'forge3' && lvl == 3)) {
        callback(completeMsg(user, q));
        removeQuest(user, q, callback);
    }
}

function checkAuction(user, type, callback) {
    let q = getQuest(user, 'auc');
    if(!q) return;

    if((q.name == 'auc1' && type == "sell") || 
        (q.name == 'auc2' && type == "bid")) {
        callback(completeMsg(user, q));
        removeQuest(user, q, callback);
    }
}

function addBonusQuest(user, callback) {
    col.update(
        { discord_id: user.discord_id },
        { $set: {quests: [getRandomQuests()[0]]} }
    ).then(e => callback());
}

function completeNext(user, callback) {
    if(user.quests && user.quests.length > 0) {
        let q = user.quests[0];
        callback(completeMsg(user, q));
        removeQuest(user, q, callback);
    }
}

function removeQuest(user, quest, callback) {
    var daily = user.dailystats;
    if(daily) {
        if(daily.quests) daily.quests++;
        else daily.quests = 1;
    } else daily = {summon: 0, send: 0, claim: 0, quests: 1};

    var award = heroes.getHeroEffect(user, 'questReward', quest.award);
    let incr = {exp: award};
    //if(promotions.current > -1) incr = {exp: award, promoexp: Math.floor(award/2)};
    col.update(
        { discord_id: user.discord_id },
        {   
            $set: {dailystats: daily},
            $inc: incr,
            $pull: {quests: {name: quest.name} },
        }
    ).then(e => {
        if(user.quests.length <= 1 && daily.quests < 3)
            heroes.getHeroEffect(user, 'questComplete', callback);
    });
}

function completeMsg(user, q) {
    let name = q.description.split('(')[0];
    return utils.formatConfirm(user, null, "you completed **" + name + "**\nYou got **" + heroes.getHeroEffect(user, 'questReward', q.award) + "**`🍅`!");
}
